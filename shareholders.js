'use strict';

const MTL_CODE = 'MTL';
const MTL_ISSUER = 'GACKTN5DAZGWXRWB2WLM6OPBDHAMT6SJNGLJZPQMEZBUR4JUGBX2UK7V';
const MTL_TREASURY = 'GDX23CPGMQ4LN55VGEDVFZPAJMAUEHSHAMJ2GMCU2ZSHN5QF4TMZYPIS';
const MTLCITY_CODE = 'MTLCITY';
const MTLCITY_ISSUER =
  'GDUI7JVKWZV4KJVY4EJYBXMGXC2J3ZC67Z6O5QFP4ZMVQM2U5JXK2OK3';

const MTL = new StellarSdk.Asset(MTL_CODE, MTL_ISSUER);
MTL.fetch_limit = 100;

const MTLCITY = new StellarSdk.Asset(MTLCITY_CODE, MTLCITY_ISSUER);
MTLCITY.fetch_limit = 100;

const Server = new StellarSdk.Server('https://horizon.stellar.org');

const StellarExpert = {
  txLink:
    tx => `https://stellar.expert/explorer/public/tx/${tx.tx_id}#${tx.id}`,
}

async function getFundInfo(asset) {
  const holders =
    await
      Server
      .accounts()
      .forAsset(asset)
      .limit(asset.fetch_limit)
      .call()
      .then(({records}) => records);

  const delegation = await getDelegations(asset);

  let supply = 0;
  let distributed = 0;
  let holderDict = {};
  for (const accountRecord of holders) {
    holderDict[accountRecord.account_id] = accountRecord;
    accountRecord.explanation = [];

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
  }

  for (const accountRecord of holders) {
    accountRecord.balanceEffective = accountRecord.balance;
    if (delegation.sources[accountRecord.account_id]) {
      const tx = delegation.sources[accountRecord.account_id];
      accountRecord.balanceEffective = 0;
      accountRecord
        .explanation
        .push(
          `delegated net share
          <a href="${StellarExpert.txLink(tx)}">to …${tx.to.substring(52)}</a>`
        );
    }
    if (delegation.targets[accountRecord.account_id]) {
      accountRecord.balanceEffective +=
        Object
        .keys(delegation.targets[accountRecord.account_id])
        .map(account => holderDict[account].balance)
        .reduce((a, b) => a + b, 0);
      accountRecord.explanation =
        accountRecord
        .explanation
        .concat(
          Object
          .entries(delegation.targets[accountRecord.account_id])
          .map(
            ([account, tx]) =>
              `delegated ${holderDict[account].share * 100}%
              <a href="${StellarExpert.txLink(tx)}">
                from …${account.substring(52)}
              </a>`
          )
        );
    }
    if (accountRecord.balanceEffective != accountRecord.balance)
      accountRecord
        .explanation
        .push(`balance with delegation = ${accountRecord.balanceEffective}`);

    accountRecord.share = accountRecord.balance / distributed;
    accountRecord.explanation.push(`net share = ${accountRecord.share * 100}%`);

    accountRecord.shareEffective = accountRecord.balanceEffective / distributed;
    if (accountRecord.shareEffective != accountRecord.share)
      accountRecord
        .explanation
        .push(`share with delegation = ${accountRecord.shareEffective}`);

    accountRecord.power = accountRecord.shareEffective;
  }

  return {
    asset: asset,
    distributed: distributed,
    holderDict: holderDict,
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
  for (const accountRecord of Object.values(parentFundInfo.holderDict)) {
    parentShares[accountRecord.account_id] =
      accountRecord.balance / parentFundInfo.distributed;
  }

  for (const accountRecord of Object.values(fundInfo.holderDict)) {
    if (accountRecord.account_id in parentShares) {
      accountRecord.parentShare = parentShares[accountRecord.account_id];
      const powerup =
        accountRecord.parentShare
        * fundInfo.holderDict[MTL_TREASURY].shareEffective;
      accountRecord.power += powerup;
      accountRecord
        .explanation
        .push(
          `share in MTL = ${accountRecord.parentShare * 100}%`,
          `powerup from MTL = ${powerup * 100}%`
        );
    }
  }

  // append parent holders
  for (const accountRecord of Object.values(parentFundInfo.holderDict)) {
    if (!(accountRecord.account_id in fundInfo.holderDict)) {
      accountRecord.balance = 0;
      accountRecord.share = 0;
      accountRecord.parentShare = parentShares[accountRecord.account_id];
      const powerup =
        accountRecord.parentShare
        * fundInfo.holderDict[MTL_TREASURY].shareEffective;
      accountRecord.power = powerup;
      accountRecord
        .explanation
        .push(
          'account came from MTL',
          `share in MTL = ${accountRecord.parentShare * 100}%`,
          `powerup from MTL = ${powerup * 100}%`
        );
      fundInfo.holderDict[accountRecord.account_id] = accountRecord;
    }
  }
}

function appendHoldersTableRow(fundInfo, table, accountRecord) {
  const name_html =
    accountRecord.account_id == MTL_TREASURY
    ? 'MTL Treasury'
    : `<a
        href=
          "https://stellar.expert/explorer/public/account/${accountRecord.account_id}"
        rel="nofollow noreferrer noopener"
        target="_blank">
        <nobr>
          …${accountRecord.account_id.substring(52)}
        </nobr>
      </a>`;

  // TODO show the final power of the vote given the participation in the MTL and the delegation transactions
  // TODO if vote power is less than 0.01 then show "<0.01%"
  // TODO don't show accounts with 0 vote power
  const power = (accountRecord.power * 100).toFixed(2) + '%';

  const tr = table.appendChild(document.createElement('tr'));
  // TODO calculate Rank for accounts, starts from 1
  tr.appendChild(document.createElement('td')).innerText = '0';

  // TODO show it only to signers of issuer
  const power_td = tr.appendChild(document.createElement('td'));
  power_td.classList.add('power');
  power_td.innerText = power;

  tr.appendChild(document.createElement('td')).innerText = 'S';
  tr.appendChild(document.createElement('td')).innerHTML = name_html;
  tr.appendChild(document.createElement('td')).innerText =
    accountRecord.balance;
  // TODO remove this column later
  tr.appendChild(document.createElement('td')).innerHTML =
    accountRecord.explanation.join(', ');
}

function makeHoldersTable(fundInfo, table) {
  // sort by .power descending
  const holders =
    Object.values(fundInfo.holderDict).sort((a, b) => b.power - a.power);

  for (const accountRecord of holders) {
    if (accountRecord.account_id != MTL_TREASURY)
      appendHoldersTableRow(fundInfo, table, accountRecord);
  }
}

async function getDelegations(asset) {
  const response =
    await
      fetch(
        'https://api.stellar.expert/explorer/public/payments?' +
        `asset=${asset.getCode()}-${asset.getIssuer()}&limit=200&order=desc`
      );
  const responseJson = await response.json();
  const payments = responseJson._embedded.records;

  let sources = {};
  let targets = {};
  for (const payment of payments) {
    if (payment.from in sources)
      continue; // keep only first met (last happened) delegation
    switch (payment.memo) {
      case 'delegate':
        sources[payment.from] = payment;
        if (!(targets[payment.to]))
          targets[payment.to] = {};
        targets[payment.to][payment.from] = payment;
        break;
      case 'undelegate':
        sources[payment.from] = 'undelegate';
        break;
    }
  }

  return {sources: sources, targets: targets};
}
