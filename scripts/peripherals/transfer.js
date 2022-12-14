const { getFrameSigner, deployContract, contractAt, sendTxn } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const signer = await getFrameSigner()
  const receiver = "0x937B52690883994B0549b6a3093356b83a1F59a0"

  const tokenAddress = "0xff970a61a04b1ca14834a43f5de4533ebddb5cc8"
  const tokenDecimals = 6
  const tokenAmount = 10000

  const token = await contractAt("Token", tokenAddress, signer)
  await sendTxn(token.transfer(receiver, expandDecimals(tokenAmount, tokenDecimals)), "token.transfer")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
