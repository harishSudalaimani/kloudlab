use hmac::{Hmac, Mac};
use sha2::Sha256;

type HmacSha256 = Hmac<Sha256>;

/// Verifies Razorpay's webhook signature over the exact raw request body.
pub fn verify_webhook(raw_body: &[u8], signature_hex: &str, secret: &[u8]) -> bool {
    let Ok(signature) = hex::decode(signature_hex) else {
        return false;
    };
    let Ok(mut mac) = HmacSha256::new_from_slice(secret) else {
        return false;
    };
    mac.update(raw_body);
    mac.verify_slice(&signature).is_ok()
}

/// Verifies the checkout signature (`order_id|payment_id`) on the backend.
pub fn verify_checkout(
    order_id: &str,
    payment_id: &str,
    signature_hex: &str,
    secret: &[u8],
) -> bool {
    let Ok(signature) = hex::decode(signature_hex) else {
        return false;
    };
    let Ok(mut mac) = HmacSha256::new_from_slice(secret) else {
        return false;
    };
    mac.update(format!("{order_id}|{payment_id}").as_bytes());
    mac.verify_slice(&signature).is_ok()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn sign(body: &[u8], secret: &[u8]) -> String {
        let mut mac = HmacSha256::new_from_slice(secret).unwrap();
        mac.update(body);
        hex::encode(mac.finalize().into_bytes())
    }

    #[test]
    fn webhook_signature_is_bound_to_raw_body_and_secret() {
        let body = br#"{"event":"payment.captured"}"#;
        let signature = sign(body, b"test-secret");
        assert!(verify_webhook(body, &signature, b"test-secret"));
        assert!(!verify_webhook(
            br#"{"event": "payment.captured"}"#,
            &signature,
            b"test-secret"
        ));
        assert!(!verify_webhook(body, &signature, b"wrong-secret"));
    }

    #[test]
    fn checkout_signature_binds_order_and_payment() {
        let signature = sign(b"order_1|pay_1", b"test-secret");
        assert!(verify_checkout(
            "order_1",
            "pay_1",
            &signature,
            b"test-secret"
        ));
        assert!(!verify_checkout(
            "order_2",
            "pay_1",
            &signature,
            b"test-secret"
        ));
        assert!(!verify_checkout(
            "order_1",
            "pay_1",
            "not-hex",
            b"test-secret"
        ));
    }
}
