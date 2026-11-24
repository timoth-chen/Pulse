'use strict';

const { allocate } = require('./budget-shares');
const { classify } = require('./budget-bill-classification');
const { expand } = require('./categories');

function cardShares(db, month, owner) {
  if (!owner || !db.users.some(user => user.name === owner)) return {};
  const bills = db.bills.filter(bill => bill.budgetShares?.[owner] > 0);
  if (!bills.length) return {};
  const transactions = classify(db).transactions.filter(t =>
    t.date.startsWith(month) && !t.pending && !t.hidden);
  const cardCharges = expand(transactions.filter(t => t.amount < 0 && t.budgetBillId &&
    db.accounts.some(account => account.type === 'credit' &&
      ((t.accountId && account.id === t.accountId) || require('./account-names').matches(account,t.account)))));
  const result = {};
  for (const bill of bills) {
    const charges = cardCharges.filter(t => t.budgetBillId === bill.id &&
      t.category === bill.category && t.person === owner);
    if (!charges.length) continue;
    const portions = charges.flatMap(t => allocate(-t.amount, bill.budgetShares, owner));
    const own = portions.filter(part => part.person === owner).reduce((sum, part) => sum + Math.round(part.amount * 100), 0);
    const others = portions.filter(part => part.person !== owner).reduce((sum, part) => sum + Math.round(part.amount * 100), 0);
    let repaid = 0;
    for (const link of bill.budgetRepayments || []) {
      const transaction = transactions.find(t => t.id === link.transactionId);
      const part = link.splitIndex == null && !transaction?.splits?.length
        ? transaction : transaction?.splits?.[link.splitIndex];
      if (part?.category === bill.category && part.amount > 0 &&
          (link.splitIndex == null || part.amount === link.amount) &&
          (part.person || transaction.person) === owner && link.person !== owner) {
        repaid += Math.round(part.amount * 100);
      }
    }
    result[bill.id] = { own: own / 100, unreimbursed: Math.max(0, others - repaid) / 100 };
  }
  return result;
}
module.exports = { cardShares };
