'use strict';
const banks=[[/scotia|\bbns\b/i,'Scotiabank'],[/\btd\b|toronto dominion/i,'TD'],[/amex|american express/i,'American Express'],[/\bcibc\b/i,'CIBC'],[/\brbc\b|royal bank/i,'RBC'],[/rogers/i,'Rogers'],[/tangerine/i,'Tangerine'],[/wealth\s*simple/i,'Wealthsimple']];
function bank(text){return banks.find(([re])=>re.test(text))?.[1];}
function name(t,account={},raw={}){
 const display=t.displayName||t.merchant||'',statement=t.originalStatement||t.originalName||'';
 if(t.category==='Credit Card Payment'||/credit\s*card\s*payment/i.test(raw.transaction_type||'')){
  if(/travel credit|cashback|reward|refund/i.test(display))return null;
  const issuer=bank(display)||bank(statement)||(account.type==='credit'?bank([account.name,account.institution].join(' ')):null);
  return issuer?issuer+' credit card payment':null;
 }
 if(/^from\s+wealth\s*simple$/i.test(display))return 'Wealthsimple';
 if(/^to\s+eq bank$/i.test(display))return 'EQ Bank';
 if(/^to\s+investments$/i.test(display))return 'Investments';
 const etransfer=/e[ -]?transfer/i.test(raw.transaction_sub_type||'')||/p\s*2\s*p\s*payment/i.test(raw.transaction_type||'')||/^e[ -]?transfer\b/i.test(display);
 if(etransfer){const payee=String(raw.payee||'').trim();if(payee&&(!display||/^e[ -]?transfer\b|^p\s*2\s*p\b|^(?:sent to|received from|from|to)\s/i.test(display)))return payee;const stripped=display.replace(/^e[ -]?transfer\s+(?:sent\s+to|received\s+from|to|from)\s+/i,'').trim();if(stripped!==display&&stripped&&!/\bme\b.*[0-9]|cancel/i.test(stripped))return stripped;if(/^e[ -]?transfer\s+cancel/i.test(display))return 'E-transfer cancellation';if(/^e[ -]?transfer(?:$|\s+sent\s+me\b| · purpose needs review)/i.test(display))return 'E-transfer';}
 return null;
}
module.exports={name,bank};
