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

      function share(accountRecord) {
        return accountRecord.balance / accountRecord.fundInfo.distributed;
      }

      function shareEffective(accountRecord) {
        return accountRecord.balanceEffective / accountRecord.fundInfo.distributed;
      }

      function power(accountRecord) {
        return share(accountRecord) + (accountRecord.shareViaParent || 0);
      }

      function powerEffective(accountRecord) {
        const p =
          shareEffective(accountRecord) + (accountRecord.shareViaParentEffective || 0);
        if (isNaN(p))
          console.log('powerEffective', p, accountRecord);
        return p;
      }

      function mtlTreasuryShareEffective(fundInfo) {
        return (
          fundInfo.holderDict[MTL_TREASURY].balanceEffective / fundInfo.distributed
        );
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

        const delegations = await getDelegations(asset);

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
                asset_code   == asset.code &&
                asset_issuer == asset.issuer
            )
            .map(({balance}) => +balance);
          accountRecord.balance = balance;

          supply += balance;

          if (accountRecord.account_id != MTL_TREASURY || asset != MTL)
            distributed += balance;
        }

        const fundInfo = {
          asset: asset,
          delegations: delegations,
          distributed: distributed,
          holderDict: holderDict,
          supply: supply,
        };

        for (const accountRecord of holders) {
          accountRecord.fundInfo = fundInfo;
          accountRecord.balanceEffective = accountRecord.balance;
          if (delegations.sources[accountRecord.account_id]) {
            const tx = delegations.sources[accountRecord.account_id];
            accountRecord.balanceEffective = 0;
            accountRecord
              .explanation
              .push(
                `delegated net share
                <a href="${StellarExpert.txLink(tx)}">to …${tx.to.substring(52)}</a>`
              );
          }
          if (delegations.targets[accountRecord.account_id]) {
            accountRecord.balanceEffective +=
              Object
              .keys(delegations.targets[accountRecord.account_id])
              .map(account => holderDict[account].balance)
              .reduce((a, b) => a + b, 0);
            accountRecord.explanation =
              accountRecord
              .explanation
              .concat(
                Object
                .entries(delegations.targets[accountRecord.account_id])
                .map(
                  ([account, tx]) =>
                    `delegated net share
                    ${holderDict[account].balance / distributed * 100}%
                    <a href="${StellarExpert.txLink(tx)}">
                      from …${account.substring(52)}
                    </a>`
                )
              );
          }

          accountRecord
            .explanation
            .push(
              `net share = ${share(accountRecord) * 100}%`
            );

          if (accountRecord.balanceEffective != accountRecord.balance) {
            accountRecord
              .explanation
              .push(
                `balance with delegation = ${accountRecord.balanceEffective}`,
                `share with delegation =
                  ${shareEffective(accountRecord)}`
              );
          }
        }

        return fundInfo;
      }

      function setHoldersStats(fundInfo, supply_text, distributed_text) {
        supply_text.innerText = fundInfo.supply;
        if (distributed_text)
          distributed_text.innerText = fundInfo.distributed;
      }

      function mergeMtlHolders(fundInfo, parentFundInfo) {
        let sharesInParent = {};
        for (const accountRecord of Object.values(parentFundInfo.holderDict)) {
          sharesInParent[accountRecord.account_id] =
            share(accountRecord, parentFundInfo.distributed);
        }

        for (const accountRecord of Object.values(fundInfo.holderDict)) {
          accountRecord.shareViaParent = 0;
          if (accountRecord.account_id in sharesInParent) {
            const shareInParent = sharesInParent[accountRecord.account_id];
            accountRecord.shareViaParent =
              shareInParent * mtlTreasuryShareEffective(fundInfo);
            accountRecord
              .explanation
              .push(
                `share in MTL = ${shareInParent * 100}%`,
                `share via MTL = ${accountRecord.shareViaParent * 100}%`
              );
          }
        }

        // append parent holders
        for (const accountRecord of Object.values(parentFundInfo.holderDict)) {
          if (!(accountRecord.account_id in fundInfo.holderDict)) {
            accountRecord.balance = 0;
            accountRecord.balanceEffective = 0;
            const shareInParent = sharesInParent[accountRecord.account_id];
            accountRecord.shareViaParent =
              shareInParent * mtlTreasuryShareEffective(fundInfo);
            accountRecord.explanation =
              [
                'account came from MTL',
                `share in MTL = ${shareInParent * 100}%`,
                `share via MTL = ${accountRecord.shareViaParent * 100}%`
              ];
            fundInfo.holderDict[accountRecord.account_id] = accountRecord;
          }
        }

        for (const accountRecord of Object.values(fundInfo.holderDict)) {
          accountRecord.shareViaParentEffective = accountRecord.shareViaParent;
          if (fundInfo.delegations.sources[accountRecord.account_id]) {
            const tx = fundInfo.delegations.sources[accountRecord.account_id];
            accountRecord.shareViaParentEffective = 0;
            accountRecord
              .explanation
              .push(
                `delegated MTL share
                <a href="${StellarExpert.txLink(tx)}">to …${tx.to.substring(52)}</a>`
              );
          }
          if (fundInfo.delegations.targets[accountRecord.account_id]) {
            accountRecord.shareViaParentEffective +=
              Object
              .keys(fundInfo.delegations.targets[accountRecord.account_id])
              .map(account => fundInfo.holderDict[account].shareViaParent)
              .reduce((a, b) => a + b, 0);
            accountRecord.explanation =
              accountRecord
              .explanation
              .concat(
                Object
                .entries(fundInfo.delegations.targets[accountRecord.account_id])
                .map(
                  ([account, tx]) =>
                    `delegated MTL share
                    ${fundInfo.holderDict[account].shareViaParent * 100}%
                    <a href="${StellarExpert.txLink(tx)}">
                      from …${account.substring(52)}
                    </a>`
                )
              );
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
        const power_html =
          (power(accountRecord) != 0 && powerEffective(accountRecord) == 0)
          ? `<s title="Delegated">${(power(accountRecord) * 100).toFixed(2)}%</s>`
          : `${(powerEffective(accountRecord) * 100).toFixed(2)}%`;

        const tr = table.appendChild(document.createElement('tr'));
        // TODO calculate Rank for accounts, starts from 1
        tr.appendChild(document.createElement('td')).innerText = '0';

        // TODO show it only to signers of issuer
        const power_td = tr.appendChild(document.createElement('td'));
        power_td.classList.add('power');
        power_td.innerHTML = power_html;

        tr.appendChild(document.createElement('td')).innerText = 'S';
        tr.appendChild(document.createElement('td')).innerHTML = name_html;
        tr.appendChild(document.createElement('td')).innerText =
          accountRecord.balance;
        // TODO remove this column later
        tr.appendChild(document.createElement('td')).innerHTML =
          accountRecord.explanation.join(', ');
      }

      function makeHoldersTable(fundInfo, table) {
        // sort by powerEffective descending
        const holders =
          Object
          .values(fundInfo.holderDict)
          .sort((a, b) => powerEffective(b) - powerEffective(a));

        for (const accountRecord of holders) {
          if (accountRecord.account_id != MTL_TREASURY)
            appendHoldersTableRow(fundInfo, table, accountRecord);
        }
      }
      let cache = caches.open('cache');
      
      async function getDelegations(asset)
      { 
        if(cache.match(asset) !== undefined) //If this data is available in cache
        {
          return await cache.match(asset);

        } else { 
            const response =
             await
                fetch(
                'https://api.stellar.expert/explorer/public/payments?' +
                `asset=${asset.code}-${asset.issuer}&limit=200&order=desc`
                );
            cache.add(response);
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
                    sources[payment.from] = false;
                    break;
                }
            }
            return {sources: sources, targets: targets};
        }
      }

      (async () => {
        const mtlFundInfo = await getFundInfo(MTL);
        setHoldersStats(mtlFundInfo, mtl_supply_text, mtl_distributed_text);
        makeHoldersTable(mtlFundInfo, mtl_holders_table);
        const mtlcityFundInfo = await getFundInfo(MTLCITY);
        setHoldersStats(mtlcityFundInfo, mtlcity_supply_text);
        mergeMtlHolders(mtlcityFundInfo, mtlFundInfo);
        makeHoldersTable(mtlcityFundInfo, mtlcity_holders_table);
      })();