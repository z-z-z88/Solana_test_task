const solanaWeb3 = require('@solana/web3.js');

class tokenInfo{
    baseMint;
    dexScreenerUrl;
    quoteMint;
    constructor(base, quote, apiUrl) {
        this.baseMint = base;
        this.quoteMint = quote;
        this.dexScreenerUrl = apiUrl + base;
    }
    async getDexscreenerInfo(){
        let resp = await fetch(this.dexScreenerUrl);
        if(!resp.ok){
            console.log("loq err");
            return false;
        }
        let data = await resp.json();
        //loop through to find Raydium AMM
        for (let i = 0; i < data.pairs.length; i++){
            if(data.pairs[i].dexId === "raydium" && data.pairs[i].quoteToken.address === this.quoteMint){
                return {usdLiquidity:data.pairs[i].liquidity.usd, AMMaddr:data.pairs[i].pairAddress, name: data.pairs[i].baseToken.name, symbol: data.pairs[i].baseToken.symbol};
            }
        }
        return false;
    }
    getTransactionDetails(transaction){
        //find receiver and sender etc
        let base_owners = {}, quote_owners={}, data = false;

        for (let i=0;i < transaction.meta.preTokenBalances.length;i++){
            //calculate base token balances
            if(transaction.meta.preTokenBalances[i].mint === this.baseMint) {
                if(!base_owners.hasOwnProperty(transaction.meta.preTokenBalances[i].owner))base_owners[transaction.meta.preTokenBalances[i].owner] = 0;
                if(transaction.meta.postTokenBalances[i].uiTokenAmount.uiAmount !== null && transaction.meta.preTokenBalances[i].uiTokenAmount.uiAmount !== null)
                    base_owners[transaction.meta.preTokenBalances[i].owner] += transaction.meta.postTokenBalances[i].uiTokenAmount.uiAmount - transaction.meta.preTokenBalances[i].uiTokenAmount.uiAmount;
            }
            //calculate quote token balances
            if(transaction.meta.preTokenBalances[i].mint === this.quoteMint) {
                if(!quote_owners.hasOwnProperty(transaction.meta.preTokenBalances[i].owner))quote_owners[transaction.meta.preTokenBalances[i].owner] = 0;
                if(transaction.meta.postTokenBalances[i].uiTokenAmount.uiAmount !== null && transaction.meta.preTokenBalances[i].uiTokenAmount.uiAmount !== null)
                    quote_owners[transaction.meta.preTokenBalances[i].owner] += transaction.meta.postTokenBalances[i].uiTokenAmount.uiAmount - transaction.meta.preTokenBalances[i].uiTokenAmount.uiAmount;
            }
        }

        let len = Object.keys(base_owners).length;
        for(let i=0;i < len;i++){
            let key = Object.keys(base_owners)[i];
            if(base_owners[key] !== 0 && quote_owners.hasOwnProperty(key) && quote_owners[key] !== 0){
                if(base_owners[key] < 0 && quote_owners[key] > 0){
                    let addr = this.getMatchingAddress(base_owners, key);
                    if(addr !== false){
                        data = {};
                        data.receiver = addr;
                        data.sender = key;
                        data.base_amount = Math.abs(base_owners[key]);
                        data.quote_amount = quote_owners[key];
                        return data;
                    }
                }
                if(base_owners[key] > 0 && quote_owners[key] < 0){
                    let addr = this.getMatchingAddress(base_owners, key);
                    console.log("key", key, "addr", addr);
                    if(addr !== false){
                        data = {};
                        data.receiver = key;
                        data.sender = addr;
                        data.base_amount = base_owners[key];
                        data.quote_amount = Math.abs(quote_owners[key]);
                        return data;
                    }
                }
            }
        }
        return data;
    }
    getMatchingAddress(arr, addr){
        let len = Object.keys(arr).length;
        for(let i=0;i < len;i++){
            let key = Object.keys(arr)[i];
            if(key !== addr && arr[key] !== 0 && Math.abs(arr[key])/Math.abs(arr[addr]) > 0.9 && Math.abs(arr[key])/Math.abs(arr[addr]) < 1.1) return key;
        }
        return false;
    }
    async getTransactionForAmmAddress(ammAddress, req_limit){
        try {
            const connection = new solanaWeb3.Connection(solanaWeb3.clusterApiUrl('mainnet-beta'), {commitment:'confirmed', disableRetryOnRateLimit: true});
            let signatures = await connection.getSignaturesForAddress(new solanaWeb3.PublicKey(ammAddress), {limit:req_limit});
            for(let i=0;i < signatures.length; i++){
                if(signatures[i].err !== null){
                    //skip bad transactions
                    continue;
                }
                try {
                    var transaction = await connection.getTransaction(signatures[i].signature,{maxSupportedTransactionVersion:0});
                } catch (error) {
                    //skip and try to get next transaction
                    console.error('Error fetching signatures:', error);
                    continue;
                }
                if(transaction.meta.err !== null) {
                    continue;
                }
                //look for Swap instruction
                let foundSwap = false;
                transaction.meta.logMessages.forEach((str) => {
                    if(str.includes("Instruction: Swap")) foundSwap = true;
                });
                if(foundSwap === true) {
                    let data = this.getTransactionDetails(transaction);
                    if(data !== false) {
                        data.slot = signatures[i].slot;
                        data.tx = signatures[i].signature;
                        return data;
                    }
                }
            }
            //no swaps have been found
            return {error: true, error_msg: "no swaps have been found"};
        } catch (error) {
            console.error('Error fetching signatures:', error);
            return {error: true, error_msg: "Error fetching signatures"};
        }
    }
}
module.exports = tokenInfo;