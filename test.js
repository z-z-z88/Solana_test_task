const http= require("http");
const dexScreenerUrl = "https://api.dexscreener.com/latest/dex/tokens/";
const tokenInfo = require('./tokenInfo');
const baseMint = "JUPyiwrYJFskUPiHa7hkeR8VUtAeFoSYbKedZNsDvCN";
const quoteMint = "So11111111111111111111111111111111111111112";

const server =  http.createServer(async function(request, response){
    response.setHeader('Content-Type', 'application/json');
    if(request.url !== "/token"){
        response.end('{"error": true, "error_msg": "Unsupported url. Use /token address to get info"}');
        return;
    }
    let jupToken = new tokenInfo(baseMint, quoteMint, dexScreenerUrl);
    //Dexscreener API call
    let dexs = await jupToken.getDexscreenerInfo();
    let resp = {};
    resp["Token_name"] = dexs.name;
    resp["Token_symbol"] = dexs.symbol;
    resp["Liquidity(USD)"] = dexs.usdLiquidity;
    resp["AMM_address"] = dexs.AMMaddr;
    //request to Solana RPC API
    let data = await jupToken.getTransactionForAmmAddress(dexs.AMMaddr, 50);
    if(data.error === true)
        resp = data;
    else {
        resp["Receiver"] = data.receiver;
        resp["Sender"] = data.sender;
        resp["Tx_base_amount"] = data.base_amount;
        resp["TX_quote_amount"] = data.quote_amount;
        resp["slot"] = data.slot;
        resp["transaction"] = data.tx;
    }
    response.end(JSON.stringify(resp));
});

server.listen(80, function(){ console.log("Server has been started, open http://localhost/token")});