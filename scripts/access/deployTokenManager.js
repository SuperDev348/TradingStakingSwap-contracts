const { deployContract, contractAt, writeTmpAddresses, sendTxn } = require("../shared/helpers")

async function main() {
  const tokenManager = await deployContract("TokenManager", [3], "TokenManager")

  const signers = [
    "0x937B52690883994B0549b6a3093356b83a1F59a0", // Dovey
    "0x99286B99f68f54e7797cB9C10133768e687DCcFF", // G
  ]

  await sendTxn(tokenManager.initialize(signers), "tokenManager.initialize")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
