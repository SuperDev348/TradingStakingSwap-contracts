const { deployContract, contractAt, writeTmpAddresses } = require("../shared/helpers")

async function main() {
  // await deployContract("EsOpec", [])
  await deployContract("XPC", [])
  // await deployContract("MintableBaseToken", ["esOpec IOU", "esOpec:IOU", 0])
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
