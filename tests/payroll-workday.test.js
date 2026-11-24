'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{parsePayrollText,validatePayroll}=require('../lib/payroll');
const sample=(override='')=>`ENHANCE Ontario 1 Oct 19, 2026 Nov 1, 2026 Nov 6, 2026
Gross Pay Pre Tax Deductions Statutory Taxes Other Deductions Net Pay
Current 3,832.28 286.60 977.99 68.87 2,498.82
YTD 62,606.72 4,664.27 15,795.21 582.05 41,565.19
Canada Pension Plan (CPP) 220.31 3,601.85
Employment Insurance - EI 62.47 1,020.49
Federal Income Tax (FIT) 461.22 7,394.32
Province Income Tax (PIT) - ON 233.99 3,778.55
HOOPP Employee Hi 88.62 1,338.21
HOOPP Employee Low 197.98 3,326.06
Dental EE 22.00 132.00
Extended Health EE 41.87 251.22
HOODIP - LTD EE 113.83
PayDay Lottery 5.00 85.00
HOOPP ER 361.12 5,876.94
Employer Paid Benefits 556.46 7,522.53
${override}`;
test('Workday insurance, lottery and employee/employer HOOPP reconcile without double-counting',()=>{
 const r=validatePayroll({...parsePayrollText(sample()),person:'Timothy'},{users:[{name:'Timothy'}]});assert.equal(r.current.benefits,63.87);assert.equal(r.ytd.benefits,497.05);assert.equal(r.current.lottery,5);assert.equal(r.ytd.lottery,85);assert.equal(r.current.other,0);assert.equal(r.current.employerPension,361.12);assert.equal(r.reconciliation.unclassified,0);assert.equal(r.deductionDetails.find(d=>d.label.includes('disability')).current,0);assert.equal(r.deductionDetails.find(d=>d.label.includes('disability')).ytd,113.83);
});
test('a separately printed dated pension correction is current-only and not added to YTD again',()=>{
 const text=sample().replace('Current 3,832.28 286.60 977.99 68.87 2,498.82','Current 3,832.28 306.67 977.99 68.87 2,478.75').replace('HOOPP Employee Hi 88.62 1,338.21','HOOPP Employee Hi 88.62 1,338.21\nHOOPP Employee Hi - 2026-03-23 - 2026-05-03 20.07');
 const r=parsePayrollText(text);assert.equal(r.current.pension,306.67);assert.equal(r.ytd.pension,4664.27);assert.equal(r.deductionDetails.find(d=>d.label==='HOOPP employee high').current,108.69);
});
test('deduction details must agree with the combined totals and cannot conceal a mismatch',()=>{
 const r={...parsePayrollText(sample()),person:'Timothy'};r.deductionDetails[0].current+=5;assert.throws(()=>validatePayroll(r,{users:[{name:'Timothy'}]}),/detail does not match/);
});
test('hourly rate retains three decimals and regular hours come from the earnings row',()=>{
 const r=parsePayrollText(sample('REGULAR Oct 19, 2026 - Nov 1,\n75 51.097 3,832.28 56,575.49\n2026'));assert.equal(r.hourlyRate,51.097);assert.equal(r.regularHours,75);const v=validatePayroll({...r,person:'Timothy'},{users:[{name:'Timothy'}]});assert.equal(v.hourlyRate,51.097);
});
