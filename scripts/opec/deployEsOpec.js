const { deployContract, contractAt, writeTmpAddresses } = require("../shared/helpers")

async function main() {
  await deployContract("OPEC", [])
  await deployContract("EsOpec", [])
}

main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error)
    process.exit(1)
  })
