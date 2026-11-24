'use strict';

function apply(db, owner = '') {
  const links = (db.bills || []).flatMap(bill =>
    (bill.budgetRepayments || []).map(link => ({ ...link, bill })));
  const byTransaction = new Map();
  for (const link of links) {
    if (!byTransaction.has(link.transactionId)) byTransaction.set(link.transactionId, []);
    byTransaction.get(link.transactionId).push(link);
  }

  // Only offset the other members’ shares of a recorded bill. Keep their full payments on their profiles.
  const charges = new Map(), remainingOffsets = new Map();
  const { expand } = require('./categories');
  const { allocate } = require('./budget-shares');
  const keyFor = (bill, month, payer) => JSON.stringify([bill.id, month, payer]);
  const billById = new Map((db.bills || []).map(bill => [bill.id, bill]));
  for (const entry of expand(db.transactions || [])) {
    const bill = billById.get(entry.budgetBillId);
    if (!bill?.budgetShares?.[entry.person] || entry.category !== bill.category ||
        entry.pending || entry.hidden || !(entry.amount < 0)) continue;
    const key = keyFor(bill, entry.date.slice(0, 7), entry.person);
    charges.set(key, (charges.get(key) || 0) + Math.round(-entry.amount * 100));
  }

  const transactions = (db.transactions || []).flatMap(transaction => {
    const linked = byTransaction.get(transaction.id);
    if (!linked || transaction.pending || transaction.hidden) return [transaction];
    const split = !!transaction.splits?.length;
    const parts = split ? transaction.splits : [transaction];
    return parts.flatMap((part, index) => {
      const entry = split ? { ...transaction, ...part, splits: undefined } : transaction;
      const matches = linked.filter(link =>
        (split ? link.splitIndex === index && link.amount === entry.amount : link.splitIndex == null) &&
        link.bill.category === entry.category && entry.amount > 0 &&
        link.person !== entry.person && db.users.some(user => user.name === link.person));
      if (matches.length !== 1) return [entry];
      if (!owner) return [];
      const { person, bill } = matches[0];
      const key = keyFor(bill, entry.date.slice(0, 7), entry.person);
      const charged = charges.get(key);
      let applied = Math.round(entry.amount * 100);
      if (charged !== undefined) {
        if (!remainingOffsets.has(key)) {
          const own = allocate(charged / 100, bill.budgetShares, entry.person)
            .find(part => part.person === entry.person)?.amount || 0;
          remainingOffsets.set(key, Math.max(0, charged - Math.round(own * 100)));
        }
        applied = Math.min(applied, remainingOffsets.get(key));
        remainingOffsets.set(key, remainingOffsets.get(key) - applied);
      }
      return [...(applied ? [{ ...entry, amount: applied / 100, budgetBillId: bill.id }] : []), { ...entry, person, owners: [person], amount: -entry.amount,
        budgetRepayment: true, budgetPlanGroup: bill.kind === 'variable' ? 'Flexible' : 'Fixed',
        budgetBillId: bill.id }];
    });
  });
  return { ...db, transactions };
}
module.exports = { apply };
