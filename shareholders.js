'use strict';

const MTL_CODE = 'MTL';
const MTL_ISSUER = 'GACKTN5DAZGWXRWB2WLM6OPBDHAMT6SJNGLJZPQMEZBUR4JUGBX2UK7V';
const MTL_TREASURY = 'GDX23CPGMQ4LN55VGEDVFZPAJMAUEHSHAMJ2GMCU2ZSHN5QF4TMZYPIS';
const MTLCITY_CODE = 'MTLCITY';
const MTLCITY_ISSUER = 'GDUI7JVKWZV4KJVY4EJYBXMGXC2J3ZC67Z6O5QFP4ZMVQM2U5JXK2OK3';

const MTL = new StellarSdk.Asset(MTL_CODE, MTL_ISSUER);
MTL.fetch_limit = 100;

const MTLCITY = new StellarSdk.Asset(MTLCITY_CODE, MTLCITY_ISSUER);
MTLCITY.fetch_limit = 100;

const server = new StellarSdk.Server('https://horizon.stellar.org');

async function getFundInfo(asset) {
  const holders =
    await
      server
        .accounts()
        .forAsset(asset)
        .limit(asset.fetch_limit)
        .call()
        .then(({records}) => records);

  let supply = 0;
  let distributed = 0;
  let mtl_treasury_balance = 0;
  for (const accountRecord of holders) {
    const [balance] =
      accountRecord
      .balances
      .filter(
        ({asset_code, asset_issuer}) =>
          asset_code   == asset.getCode() &&
          asset_issuer == asset.getIssuer()
      )
      .map(({balance}) => +balance);
    accountRecord.balance = balance;

    supply += balance;

    if (accountRecord.account_id != MTL_TREASURY || asset != MTL)
      distributed += balance;
    if (accountRecord.account_id == MTL_TREASURY)
      mtl_treasury_balance = balance;
  }

  for (const accountRecord of holders) {
    accountRecord.share = accountRecord.balance / distributed;
    accountRecord.power = accountRecord.share;
  }

  return {
    asset: asset,
    distributed: distributed,
    holders: holders,
    mtl_treasury_balance: mtl_treasury_balance,
    supply: supply,
  };
}

function setHoldersStats(fundInfo, supply_text, distributed_text) {
  supply_text.innerText = fundInfo.supply;
  if (distributed_text)
    distributed_text.innerText = fundInfo.distributed;
}

function mergeMtlHolders(fundInfo, parentFundInfo) {
  let parentShares = {};
  for (const accountRecord of parentFundInfo.holders) {
    parentShares[accountRecord.account_id] =
      accountRecord.balance / parentFundInfo.distributed;
  }

  let holderDict = {};
  for (const accountRecord of fundInfo.holders) {
    if (accountRecord.account_id in parentShares) {
      accountRecord.parentShare = parentShares[accountRecord.account_id];
      accountRecord.power +=
        accountRecord.parentShare
        * fundInfo.mtl_treasury_balance
        / fundInfo.distributed;
    }
    holderDict[accountRecord.account_id] = accountRecord;
  }

  // append parent holders
  for (const accountRecord of parentFundInfo.holders) {
    if (!(accountRecord.account_id in holderDict)) {
      accountRecord.balance = 0;
      accountRecord.share = 0;
      accountRecord.parentShare = parentShares[accountRecord.account_id];
      accountRecord.power =
        accountRecord.parentShare
          * parentFundInfo.mtl_treasury_balance
          / parentFundInfo.distributed;
      holderDict[accountRecord.account_id] = accountRecord;
    }
  }

  fundInfo.holders = Object.values(holderDict);
}

function appendHoldersTableRow(fundInfo, table, accountRecord) {
  const name_html =
    accountRecord.account_id == MTL_TREASURY
    ? 'MTL Treasury'
    : `<a href="https://stellar.expert/explorer/public/account/${accountRecord.account_id}" rel="nofollow noreferrer noopener" target="_blank">…${accountRecord.account_id.substring(52)}</a>`;

  // TODO show the final power of the vote given the participation in the MTL and the delegation transactions
  // TODO if vote power is less than 0.01 then show "<0.01%"
  // TODO don't show accounts with 0 vote power
  const power = (accountRecord.power * 100).toFixed(2) + '%';

  // TODO remove this column later
  let explanation = '';
  if (accountRecord.account_id != MTL_TREASURY)
    explanation +=
      `share in ${fundInfo.asset.getCode()} = ${accountRecord.share * 100}%`;
  if (accountRecord.parentShare)
    explanation +=
      `, share in MTL = ${accountRecord.parentShare * 100}%,
      MTL balance in ${fundInfo.asset.getCode()} =
        ${fundInfo.mtl_treasury_balance},
      MTL share in ${fundInfo.asset.getCode()} =
        ${fundInfo.mtl_treasury_balance / fundInfo.distributed * 100}%,
      share via MTL =
        ${accountRecord.parentShare
          * fundInfo.mtl_treasury_balance
          / fundInfo.distributed
          * 100}%`;

  const tr = table.appendChild(document.createElement('tr'));
  // TODO calculate Rank for accounts, starts from 1
  tr.appendChild(document.createElement('td')).innerText = '0';
  // TODO show it only to signers of issuer
  tr.appendChild(document.createElement('td')).innerText = power;
  tr.appendChild(document.createElement('td')).innerText = 'S';
  tr.appendChild(document.createElement('td')).innerHTML = name_html;
  tr.appendChild(document.createElement('td')).innerText =
    accountRecord.balance;
  tr.appendChild(document.createElement('td')).innerHTML = explanation;
}

function makeHoldersTable(fundInfo, table) {
  // sort by .power descending
  fundInfo.holders.sort((a, b) => b.power - a.power);

  for (const accountRecord of fundInfo.holders) {
    if (accountRecord.account_id != MTL_TREASURY)
      appendHoldersTableRow(fundInfo, table, accountRecord);
  }
}
