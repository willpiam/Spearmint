use aiken/collection/dict
use aiken/collection/list
use aiken/primitive/bytearray
use cardano/assets.{PolicyId}
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction}

pub type MintAction {
  Mint
  Burn
}

pub fn drop_prefix(asset_name: ByteArray) {
  bytearray.drop(asset_name, 4)
}

pub fn find_reference_utxo(
  outputs: List<Output>,
  policy_id: PolicyId,
  reference_nft_name: ByteArray,
) {
  expect Some(reference_utxo) =
    outputs
      |> list.find(
          fn(output) {
            output.value
              |> assets.tokens(policy_id)
              |> dict.to_pairs()
              |> list.any(
                  fn(pair) {
                    let Pair(asset_name, _amount) = pair
                    asset_name == reference_nft_name
                  },
                )
          },
        )

  reference_utxo
}

// prefixes
// 000de140 --> 222 (NFT)
// 0014df10 --> 333 (FT)
// 001bc280 --> 444 (RFT)
// 000643b0 --> 100 (Reference NFT)

validator sparmint(oneshot: OutputReference) {
  mint(action: MintAction, policy_id: PolicyId, self: Transaction) {
    let Transaction { inputs, mint, outputs, .. } = self

    let mint_list =
      mint
        |> assets.tokens(policy_id)
        |> dict.to_pairs()

    when action is {
      Mint -> {
        // must spend oneshot utxo (enforces the token can only be minted once)
        // must mint user token and reference NFT
        // if prefixes are removed the reference NFT name and user token name are the same
        // reference NFT on own utxo

        expect Some(Pair(reference_nft_name, reference_nft_amount)) =
          mint_list
            |> list.find(
                fn(pair) {
                  let Pair(asset_name, _amount) = pair
                  let asset_prefix = bytearray.take(asset_name, 4)
                  asset_prefix == #"000643b0"
                },
              )

        expect Some(Pair(user_token_name, user_token_amount)) =
          mint_list
            |> list.find(
                fn(pair) {
                  let Pair(asset_name, _amount) = pair
                  let asset_prefix = bytearray.take(asset_name, 4)
                  or {
                    asset_prefix == #"000de140",
                    asset_prefix == #"0014df10",
                    asset_prefix == #"001bc280",
                  }
                },
              )

        let reference_utxo =
          find_reference_utxo(outputs, policy_id, reference_nft_name)
        // there is a datum on the reference utxo
        expect InlineDatum(_reference_datum) = reference_utxo.datum

        // todo: check that the reference utxo is locked in the spend script of this validator
        and {
          user_token_amount > 0,
          1 == reference_nft_amount,
          2 == list.length(mint_list),
          list.any(inputs, fn(input) { input.output_reference == oneshot }),
          drop_prefix(reference_nft_name) == drop_prefix(user_token_name),
        }
      }
      Burn -> {
        // mint is a value which only holds a negative amount of user tokens
        expect [Pair(asset_name, amount)] = mint_list

        // asset name begins with a prefix other than the reference NFT prefix (100)
        let asset_prefix = bytearray.take(asset_name, 4)

        and {
          1 == list.length(mint_list),
          amount < 0,
          or {
            asset_prefix == #"000de140",
            asset_prefix == #"0014df10",
            asset_prefix == #"001bc280",
          },
        }
      }
    }
  }

  spend(
    _datum: Option<Data>,
    _redeemer: Data,
    _utxo: OutputReference,
    self: Transaction,
  ) {
    // todo
    // find the new reference utxo
    let Transaction { outputs, .. } = self
    let reference_utxo =
      find_reference_utxo(outputs, policy_id, reference_nft_name)
    True
  }

  else(_) {
    fail
  }
}
