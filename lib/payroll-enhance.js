'use strict';
// Workday employer layout: summaries and line items are independently reconciled.
const {parseAmount,validDate}=require('./payroll');
const money='(?:\\d[\\d,]*\\.\\d{2})';
const round=n=>Math.round(n*100)/100;
function read(text){
 if(!text.includes('ENHANCE Ontario')||!text.includes('Gross Pay Pre Tax Deductions Statutory Taxes Other Deductions Net Pay'))return null;
 const named='(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]* \\d{1,2}, \\d{4}',metadata=text.match(new RegExp('ENHANCE Ontario\\s+\\d+\\s+('+named+')\\s+('+named+')\\s+('+named+')'));if(!metadata)return null;
 const date=v=>{const t=Date.parse(v+' 12:00:00 UTC');return Number.isFinite(t)?new Date(t).toISOString().slice(0,10):'';};
 const summary=label=>text.match(new RegExp('(?:^|\\n)'+label+'\\s+('+money+')\\s+('+money+')\\s+('+money+')\\s+('+money+')\\s+('+money+')'))?.slice(1).map(parseAmount),c=summary('Current'),y=summary('YTD');if(!c||!y)return null;
 // In this layout a single printed amount is carried YTD, with no current deduction.
 const pair=label=>{const m=text.match(new RegExp('(?:^|\\n)'+label+'[ \\t]+('+money+')(?:[ \\t]+('+money+'))?[ \\t]*(?:\\n|$)'));return m?(m[2]?[parseAmount(m[1]),parseAmount(m[2])]:[0,parseAmount(m[1])]):[null,null];};
 const optional=label=>pair(label).map(v=>v??0);
 const cpp=pair('Canada Pension Plan \\(CPP\\)'),ei=pair('Employment Insurance - EI'),fed=pair('Federal Income Tax \\(FIT\\)'),prov=pair('Province Income Tax \\(PIT\\) - ON'),pensionHi=optional('HOOPP Employee Hi'),pensionLow=optional('HOOPP Employee Low'),employer=pair('HOOPP ER'),dental=optional('Dental EE'),health=optional('Extended Health EE'),disability=optional('HOODIP - LTD EE'),lottery=optional('PayDay Lottery'),employerTotal=pair('Employer Paid Benefits');
 const pensionHiAdjustments=[...text.matchAll(new RegExp('(?:^|\\n)HOOPP Employee Hi - \\d{4}-\\d{2}-\\d{2} - \\d{4}-\\d{2}-\\d{2}[ \\t]+('+money+')','g'))].reduce((n,m)=>n+parseAmount(m[1]),0);pensionHi[0]=round(pensionHi[0]+pensionHiAdjustments);
 if(Math.abs(pensionHi[0]+pensionLow[0]-c[1])>.02||Math.abs(pensionHi[1]+pensionLow[1]-y[1])>.02)return null;
 const make=(summary,i)=>({gross:summary[0],net:summary[4],deductionsTotal:round(summary[1]+summary[2]+summary[3]),pension:summary[1],cpp:cpp[i],ei:ei[i],federalTax:fed[i],provincialTax:prov[i],tax:fed[i]!==null&&prov[i]!==null?round(fed[i]+prov[i]):null,benefits:round(dental[i]+health[i]+disability[i]),lottery:lottery[i],other:0,employerPension:employer[i],employerBenefits:employerTotal[i]});
 const current=make(c,0),ytd=make(y,1);
 const regularRows=[...text.matchAll(/(?:^|\n)REGULAR\b(?:(?!\n(?:REGULAR|VACATION|Statutory Holiday|Canada Pension|Regular Earnings))[\s\S]){0,150}?(\d+(?:\.\d+)?)\s+(\d+\.\d{3})\s+(\d[\d,]*\.\d{2})/g)];
 const hourlyRate=regularRows.length?Number(regularRows.at(-1)[2]):null,regularHours=regularRows.length?regularRows.reduce((n,r)=>n+Number(r[1]),0):null;
 for(const section of [current,ytd])if(section.cpp===null||section.ei===null||section.tax===null)return null;
 const detail=(label,group,pair)=>({label,group,current:pair[0],ytd:pair[1]});
 const deductionDetails=[detail('HOOPP employee high','pension',pensionHi),detail('HOOPP employee low','pension',pensionLow),detail('Dental','benefits',dental),detail('Extended health','benefits',health),detail('Long-term disability · HOODIP','benefits',disability),detail('Payday lottery','lottery',lottery)].filter(r=>r.current||r.ytd);
 const employerBenefitDetails=[detail('HOOPP employer','employerPension',employer),...['Acc Death & Dismemberment ER','Dental ER','Extended Health ER','Group Life ER','HOODIP - LTD ER','Semi-Private ER'].map(label=>detail(label,'employerBenefits',optional(label)))].filter(r=>r.current||r.ytd);
 const evidence={'current.gross':'Current summary: '+c.join(' | '),'ytd.gross':'YTD summary: '+y.join(' | '),'current.pension':'HOOPP high + low: '+current.pension,'ytd.pension':'HOOPP high + low YTD: '+ytd.pension};
 const payDate=date(metadata[3]);if(!validDate(payDate))return null;
 return {employer:'ENHANCE Ontario',payDate,periodStart:date(metadata[1]),periodEnd:date(metadata[2]),frequency:26,hourlyRate,regularHours,current,ytd,deductionDetails,employerBenefitDetails,evidence,warnings:['Employer layout recognised. CPP2 is left blank when not printed.'],notes:'HOOPP high and low are combined once. Employer-paid benefits are informational; they do not reduce net pay. Lottery is withheld from payroll, not an additional bank expense.',text,layout:'enhance-workday'};
}
module.exports={read};
