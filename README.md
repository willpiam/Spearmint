# spearmint

A tool for minting CIP-68 tokens with proper support for burning

## Important Files

### validators/sparmint.ak

My aiken contract for minting, burning, and updating metadata.

### main_test.ts

Unit tests for my contracts.

## Plans 

### Add third constructor called `BurnEverything` to `MintAction` for burning all tokens including the reference token 

To satisfy this case in the mint validator the transaction must burn the entire supply. Unless we add some counting mechanisum we can only do this if no previous tokens have ever been minted. A counting mechanisum would be very intreasting and would mean the reference token (or some other token to hold the relevant state) would need to be speant with every burn transaction (but not burnt itself) in order to keep track of the current supply. However with out a counter the `BurnEverything` constructor would have use in cases where some none-cip-68 parameter was misconfigured and the minting user needs to start the process again. 

### A Varient specifically for NFTs

Will require both the user nft and reference NFT be burnt. 


## References

1. [Aiken Docs & standard library](https://aiken-lang.github.io/stdlib/)
2. [Mint Chocolate Chip](https://github.com/SundaeSwap-finance/mint-chocolate-chip/blob/main/validators/mint.ak)
3. [CIP-68 standard](https://cips.cardano.org/cip/CIP-68)
4. [Lucid Evolution Docs](https://anastasia-labs.github.io/lucid-evolution/)
5. [Unknown](https://github.com/apea-aiken-batch-2/nollan_mint_ai/blob/2bea4764385071aae2f08525a77aa13581aaccf0/lib/modules/types.ak#L6)

## Acknowledgements

Thank you to the following people for helping with this script

### MGpai

Mentioned that the way to encode an output reference off-chain before using it
to oneshot a validator had changed between plutusV2 and V3. Anastasia Labs
discord.

### keyanm

Read the code and offered suggestions. Aiken channel in the TxPipe discord.

<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>
<br/>

## Aiken default readme (to be removed)

Write validators in the `validators` folder, and supporting functions in the
`lib` folder using `.ak` as a file extension.

```aiken
validator my_first_validator {
  spend(_datum: Option<Data>, _redeemer: Data, _output_reference: Data, _context: Data) {
    True
  }
}
```

## Building

```sh
aiken build
```

## Configuring

**aiken.toml**

```toml
[config.default]
network_id = 41
```

Or, alternatively, write conditional environment modules under `env`.

## Testing

You can write tests in any module using the `test` keyword. For example:

```aiken
use config

test foo() {
  config.network_id + 1 == 42
}
```

To run all tests, simply do:

```sh
aiken check
```

To run only tests matching the string `foo`, do:

```sh
aiken check -m foo
```

## Documentation

If you're writing a library, you might want to generate an HTML documentation
for it.

Use:

```sh
aiken docs
```

## Resources

Find more on the [Aiken's user manual](https://aiken-lang.org).
