use aiken/collection/dict
use aiken/collection/list
use aiken/crypto.{VerificationKeyHash}
use aiken/primitive/bytearray
use cardano/address.{Script}
use cardano/assets.{PolicyId}
use cardano/transaction.{InlineDatum, Output, OutputReference, Transaction}

pub type MintAction {
  Mint
  Burn
}

pub type Extra {
  admin: VerificationKeyHash,
}

pub type Cip68 {
  metadata: Pairs<ByteArray, Data>,
  version: Int,
  extra: Extra,
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
        // reference utxo must be locked in the spend script of this validator
        expect Script(reference_script) =
          reference_utxo.address.payment_credential
        // there is a datum on the reference utxo
        expect InlineDatum(_reference_datum) = reference_utxo.datum
        // todo: check that the reference utxo is locked in the spend script of this validator
        and {
          reference_script == policy_id,
          user_token_amount > 0,
          1 == reference_nft_amount,
          2 == list.length(mint_list),
          // this "oneshot" line seems to be causing the issues
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
    datum: Option<Cip68>,
    _redeemer: Data,
    focus_input_ref: OutputReference,
    self: Transaction,
  ) {
    // 1. admin specified in the extra field of the cip68 datum must be the admin
    expect Some(prev_metadata) = datum
    // find the new reference utxo
    let Transaction { inputs, outputs, .. } = self

    // find policy id
    expect Some(focus_input) =
      list.find(inputs, fn(input) { input.output_reference == focus_input_ref })
    expect Script(policy_id) = focus_input.output.address.payment_credential

    // find reference NFT name
    let policy_tokens =
      focus_input.output.value
        |> assets.tokens(policy_id)
        |> dict.to_pairs()

    expect Some(Pair(reference_nft_name, _)) = list.head(policy_tokens)

    let reference_output =
      find_reference_utxo(outputs, policy_id, reference_nft_name)

    // prove that the new reference datum is a Cip68 (and that it has the fields we expect)
    // ----------------------------------------------------------------------------------------------------
    expect InlineDatum(new_reference_datum) = reference_output.datum
    expect _new_metadata: Cip68 = new_reference_datum
    // ----------------------------------------------------------------------------------------------------
    and {
      // admin must have signed the transaction
      list.has(self.extra_signatories, prev_metadata.extra.admin),
      // token must remain on same address
      reference_output.address == focus_input.output.address,
      // there must be no user tokens present on the input with the ref token (keep??)
      1 == list.length(policy_tokens),
      // the reference token name must have the expected prefix
      bytearray.take(reference_nft_name, 4) == #"000643b0",
    }
  }

  else(_) {
    fail
  }
}
