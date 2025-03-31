# spearmint

A tool for minting CIP-68 tokens with proper support for burning

## References

1. [Aiken Docs & standard library](https://aiken-lang.github.io/stdlib/)
2. [Mint Chocolate Chip](https://github.com/SundaeSwap-finance/mint-chocolate-chip/blob/main/validators/mint.ak)
3. [CIP-68 standard](https://cips.cardano.org/cip/CIP-68)
4. [Lucid Evolution Docs](https://anastasia-labs.github.io/lucid-evolution/)

## Acknowledgements

Thank you to the following people for helping with this script

### MGpai (Anastasia Labs discord)

Mentioned that the way to encode an output reference off-chain before using it
to oneshot a validator had changed between plutusV2 and V3.

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
