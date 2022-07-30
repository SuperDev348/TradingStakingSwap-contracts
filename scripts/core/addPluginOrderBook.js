const { contractAt , sendTxn, callWithRetries } = require("../shared/helpers")
const { expandDecimals } = require("../../test/shared/utilities")

async function main() {
  const router = await callWithRetries(contractAt, ["Router", "0x6d2FCB937472CB4c471ec79711f998984361C0ab"])

  await sendTxn(callWithRetries(router.addPlugin.bind(router), [
    "0xE41Abd3E4Ac203d92606a8b4c2Cc58bB9Ea3B167"
  ]), "router.addPlugin")
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
