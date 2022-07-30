const { deployContract, sendTxn } = require("../shared/helpers")

async function main() {
  const admin = { address: "0x937B52690883994B0549b6a3093356b83a1F59a0" }
  const token = await deployContract("SnapshotToken", ["OPEC Snapshot 1", "OPEC 1", 0])
  await sendTxn(token.setInPrivateTransferMode(true), "token.setInPrivateTransferMode")
  await sendTxn(token.setMinter(admin.address, true), "token.setMinter")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
