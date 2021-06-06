'use strict';

const MTL_CODE = 'MTL';
const MTL_ISSUER = 'GACKTN5DAZGWXRWB2WLM6OPBDHAMT6SJNGLJZPQMEZBUR4JUGBX2UK7V';
const MTL_TREASURY = 'GDX23CPGMQ4LN55VGEDVFZPAJMAUEHSHAMJ2GMCU2ZSHN5QF4TMZYPIS';
const MTLCITY_CODE = 'MTLCITY';
const MTLCITY_ISSUER =
  'GDUI7JVKWZV4KJVY4EJYBXMGXC2J3ZC67Z6O5QFP4ZMVQM2U5JXK2OK3';

const MTL     = new StellarSdk.Asset(MTL_CODE,     MTL_ISSUER);
const MTLCITY = new StellarSdk.Asset(MTLCITY_CODE, MTLCITY_ISSUER);

const server = new StellarSdk.Server('https://horizon.stellar.org');

function collectPages(asset, onPage, atEnd) {
  let collector = {
    asset: asset,
    holders: [],
    supply: 0,
    distributed: 0,
  };
  function recur(collectionPage) {
    if (collectionPage.records.length) {
      onPage(collector, collectionPage);
      collectionPage.next().then(recur);
    } else {
      // end of collection
      atEnd(collector);
    }
  };
  return recur;
}

function appendHolders(supply_text, distributed_text) {
  return (collector, collectionPage) => {
    collector.holders = collector.holders.concat(collectionPage.records);
    for (const accountRecord of collectionPage.records) {
      const [balance] =
        accountRecord
        .balances
        .filter(
          ({asset_code, asset_issuer}) =>
            asset_code   == collector.asset.getCode() &&
            asset_issuer == collector.asset.getIssuer()
        )
        .map(({balance}) => +balance);
      accountRecord.balance = balance;

      collector.supply += balance;
      supply_text.innerText = collector.supply;

      if (accountRecord.account_id != MTL_TREASURY || collector.asset != MTL)
        collector.distributed += balance;
      if (accountRecord.account_id == MTL_TREASURY)
        collector.mtl_treasury_balance = balance;

      if (distributed_text)
        distributed_text.innerText = collector.distributed;
    }
  };
}

function appendHoldersTableRow(collector, table, accountRecord) {
  const name =
    accountRecord.account_id == MTL_TREASURY
    ? 'MTL Treasury'
    : '…' + accountRecord.account_id.substring(52);

  const explanation =
    accountRecord.account_id == MTL_TREASURY
    ? ''
    : `balance = ${accountRecord.balance} ${collector.asset.getCode()},
      share in ${collector.asset.getCode()} =
        ${accountRecord.share * 100}%` +
    (accountRecord.parent_share
      ? `, share in MTL = ${accountRecord.parent_share * 100}%,
        MTL balance in ${collector.asset.getCode()} =
          ${collector.mtl_treasury_balance},
        MTL share in ${collector.asset.getCode()} =
          ${collector.mtl_treasury_balance / collector.distributed * 100}%,
        share via MTL =
          ${accountRecord.parent_share
            * collector.mtl_treasury_balance
            / collector.distributed
            * 100}%`
      : '');

  const tr = table.appendChild(document.createElement('tr'));
  tr.appendChild(document.createElement('td'))
    .appendChild(document.createTextNode(`${accountRecord.power * 100}%`));
  tr.appendChild(document.createElement('td'))
    .appendChild(document.createTextNode(name));
  tr.appendChild(document.createElement('td'))
    .appendChild(document.createTextNode(explanation));
}

function makeHoldersTable(table, parent_collector) {
  let parent_shares = {};
  if (parent_collector) {
    for (const accountRecord of parent_collector.holders) {
      parent_shares[accountRecord.account_id] =
        accountRecord.balance / parent_collector.distributed;
    }
  }

  return collector => {
    let holders = {};

    for (const accountRecord of collector.holders) {
      accountRecord.share = accountRecord.balance / collector.distributed;
      accountRecord.parent_share =
        accountRecord.account_id in parent_shares
        ? parent_shares[accountRecord.account_id]
        : 0;
      accountRecord.power =
        accountRecord.share
        + accountRecord.parent_share
          * collector.mtl_treasury_balance
          / collector.distributed;
      holders[accountRecord.account_id] = accountRecord;
    }

    // append parent holders
    if (parent_collector) {
      for (const accountRecord of parent_collector.holders) {
        if (!(accountRecord.account_id in holders)) {
          accountRecord.balance = 0;
          accountRecord.share = 0;
          accountRecord.parent_share = parent_shares[accountRecord.account_id];
          accountRecord.power =
            accountRecord.parent_share
              * collector.mtl_treasury_balance
              / collector.distributed;
          holders[accountRecord.account_id] = accountRecord;
        }
      }
    }

    holders = Object.values(holders);

    // sort by .power descending
    holders.sort((a, b) => b.power - a.power);

    for (const accountRecord of holders) {
      if (accountRecord.account_id != MTL_TREASURY)
        appendHoldersTableRow(collector, table, accountRecord);
    }
  };
}
