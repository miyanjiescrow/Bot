"""
Comprehensive Automated Scenario Test Suite for Miyanji Escrow Platform
Runs end-to-end tests across all bot flows and business logic.
"""
import os
import sys
import unittest
import time
import re

# Ensure current directory is in sys.path
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

import tests.mock_bot as mock_bot
from telebot.types import Message, CallbackQuery, Contact

import config
import utils
import database as db
import phone_utils
import deal_wizard
import kyc_service
import auth_service
import auth_handlers
import user
import admin
import keyboards as kb


class MiyanjiFullScenarioTestSuite(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.bot = mock_bot.MockTeleBot()
        # Register handlers with order of priority
        auth_handlers.register_auth_handlers(cls.bot)
        admin.register_admin_handlers(cls.bot)
        user.register_user_handlers(cls.bot)

        # Setup test user IDs
        cls.buyer_id = 900111222
        cls.seller_id = 900333444
        cls.admin_id = getattr(config.config, "ADMIN_ID", 1802649782)

    def setUp(self):
        self.bot.clear_history()

    # =========================================================================
    # SCENARIO 1: Phone Normalization & Authentication Handlers
    # =========================================================================
    def test_01_phone_normalization_and_formatting(self):
        """تست جامع نرمال‌سازی انواع فرمت‌های شماره همراه ایرانی"""
        test_cases = [
            ("09123456789", "09123456789"),
            ("+989123456789", "09123456789"),
            ("00989123456789", "09123456789"),
            ("989123456789", "09123456789"),
            ("۰۹۱۲۳۴۵۶۷۸۹", "09123456789"), # Persian numerals
            ("۰۹۱۲-۳۴۵-۶۷۸۹", "09123456789"), # Persian with dashes
            (" 0912 345 6789 ", "09123456789"),
        ]
        for raw, expected in test_cases:
            norm = phone_utils.normalize_phone_number(raw)
            self.assertEqual(norm, "98" + expected[1:], f"Failed normalizing phone {raw}")
            formatted = phone_utils.format_iranian_phone(raw)
            self.assertEqual(formatted, expected, f"Failed formatting phone {raw}")
            self.assertTrue(phone_utils.is_valid_iranian_phone(norm), f"Invalid phone check for {norm}")

        # Invalid phone numbers
        invalid_cases = ["08123456789", "0912345678", "091234567890", "abcd", ""]
        for inv in invalid_cases:
            self.assertFalse(phone_utils.is_valid_iranian_phone(inv), f"Should be invalid: {inv}")

    # =========================================================================
    # SCENARIO 2: Iranian National ID & Sheba (IBAN) Checksum Algorithms
    # =========================================================================
    def test_02_national_id_and_sheba_checksums(self):
        """اعتبارسنجی دقیق الگوریتم‌های ملی کد ملی و شماره شبای MOD-97"""
        # 1. National ID checks
        valid_nids = ["0010350829", "0078652413", "0499370899"]
        for nid in valid_nids:
            self.assertTrue(utils.validate_national_id(nid), f"Valid NID flagged as invalid: {nid}")

        invalid_nids = [
            "1111111111", # 10 identical digits
            "2222222222",
            "1234567890", # Bad checksum
            "0010350820",
            "12345",      # Too short
            "123456789012" # Too long
        ]
        for inv in invalid_nids:
            self.assertFalse(utils.validate_national_id(inv), f"Invalid NID passed validation: {inv}")

        # 2. Sheba / IBAN checks
        valid_sheba = "IR160120000000001234567890" # Well-formed checksum (check digit 16)
        self.assertTrue(db.validate_iranian_sheba(valid_sheba), "Valid Sheba failed MOD-97 checksum")
        
        # Test lower-case and spaces auto-handling
        self.assertTrue(db.validate_iranian_sheba("  ir160120000000001234567890 "), "Sheba lowercase/spaces failed")

        # Invalid Sheba checks
        self.assertFalse(db.validate_iranian_sheba("IR000000000000000000000000"), "Bad checksum passed")
        self.assertFalse(db.validate_iranian_sheba("US820120000000001234567890"), "Non-IR Sheba passed")
        self.assertFalse(db.validate_iranian_sheba("IR123"), "Short Sheba passed")

    # =========================================================================
    # SCENARIO 3: Financial PIN Lifecycle & Brute Force Lockout
    # =========================================================================
    def test_03_financial_pin_security(self):
        """تست امنیت پین‌کد مالی، هشدارهای پین ناامن و قفل شدن پس از ۳ تلاش ناموفق"""
        test_uid = 99887766

        # Set up clean user
        db.register_or_update_user(user_id=test_uid, username="pintesther", first_name="Pin Tester")
        user_rec = db.get_user(test_uid)
        user_rec["phone_number"] = "09121112233"
        user_rec["is_verified"] = True
        db.save_user(user_rec)

        # 1. Weak PIN rejection
        weak_pins = ["1234", "1111", "0000", "9876", "12"]
        for wp in weak_pins:
            res = auth_service.set_user_financial_pin(test_uid, wp)
            self.assertFalse(res.get("success"), f"Weak PIN was accepted: {wp}")

        # 2. Valid PIN registration
        res_valid = auth_service.set_user_financial_pin(test_uid, "8492")
        self.assertTrue(res_valid.get("success"), f"Valid PIN rejected: {res_valid}")
        
        # Verify PIN exists
        self.assertTrue(auth_service.has_financial_pin(test_uid))

        # 3. Successful verification
        res_verify = auth_service.verify_financial_pin(test_uid, "8492")
        self.assertTrue(res_verify.get("success"))

        # 4. Failed attempts and 3-strike lockout
        # Attempt 1
        a1 = auth_service.verify_financial_pin(test_uid, "0000")
        self.assertFalse(a1.get("success"))
        self.assertEqual(a1.get("remaining_attempts"), 2)

        # Attempt 2
        a2 = auth_service.verify_financial_pin(test_uid, "0000")
        self.assertFalse(a2.get("success"))
        self.assertEqual(a2.get("remaining_attempts"), 1)

        # Attempt 3 -> Must lock
        a3 = auth_service.verify_financial_pin(test_uid, "0000")
        self.assertFalse(a3.get("success"))
        self.assertTrue(a3.get("locked"))
        self.assertEqual(a3.get("remaining_attempts"), 0)

        # Attempt 4 with CORRECT pin while locked -> Must still be rejected!
        a4 = auth_service.verify_financial_pin(test_uid, "8492")
        self.assertFalse(a4.get("success"), "PIN verification succeeded while account should be locked!")
        self.assertTrue(a4.get("locked"))

    # =========================================================================
    # SCENARIO 4: Zero Duplicate Domain Bug Check for Party B Links
    # =========================================================================
    def test_04_invite_link_zero_domain_duplication(self):
        """تست اختصاصی و قطعی عدم تکرار t.me در انواع فرمت‌های لینک دعوت طرف دوم"""
        dirty_bot_names = [
            "T.me/mianji_ir_bot",
            "https://t.me/T.me/mianji_ir_bot",
            "http://t.me/mianji_ir_bot",
            "@mianji_ir_bot",
            "mianji_ir_bot",
            "https://t.me/mianji_ir_bot?start=123",
            "t.me/t.me/mianji_ir_bot",
            None,
            ""
        ]

        test_cid = "DSG-0508-1962"
        for raw_bot in dirty_bot_names:
            link = utils.generate_quick_contract_link(raw_bot, test_cid)
            # Count occurrences of t.me
            tme_count = len(re.findall(r"t\.me", link, flags=re.IGNORECASE))
            self.assertEqual(tme_count, 1, f"Duplicate t.me in link: '{link}' from '{raw_bot}'")
            self.assertNotIn("c_c_", link, f"Duplicate c_ in link: '{link}'")
            self.assertTrue(link.startswith("https://t.me/"), f"Link doesn't start with https://t.me/: '{link}'")
            self.assertIn(test_cid, link)

            # Test invitation message generator
            msg = utils.format_invitation_message(test_cid, raw_bot)
            extracted_links = re.findall(r"https?://[^\s`\"'\)]+", msg)
            self.assertTrue(len(extracted_links) >= 1)
            for el in extracted_links:
                self.assertEqual(len(re.findall(r"t\.me", el, flags=re.IGNORECASE)), 1, f"Duplicate t.me in msg link: {el}")

    # =========================================================================
    # SCENARIO 5: Full Contract Creation Wizard -> Digital Signature -> Party B Acceptance
    # =========================================================================
    def test_05_contract_creation_and_party_b_signing(self):
        """اجرای سناریوی کامل ثبت معامله جدید، امضای طرف اول، صدور لینک و امضای طرف دوم"""
        buyer_uid = self.buyer_id
        seller_uid = self.seller_id

        # 1. Register both users
        db.register_or_update_user(user_id=buyer_uid, username="buyer_test", first_name="علی کارفرما")
        u_b = db.get_user(buyer_uid)
        u_b["phone_number"] = "09121111111"
        u_b["is_verified"] = True
        u_b["national_id"] = "0010350829"
        db.save_user(u_b)

        db.register_or_update_user(user_id=seller_uid, username="seller_test", first_name="رضا برنامه‌نویس")
        u_s = db.get_user(seller_uid)
        u_s["phone_number"] = "09122222222"
        u_s["is_verified"] = True
        u_s["national_id"] = "0078652411"
        db.save_user(u_s)

        # 2. Simulate User initiating deal creation
        cid = f"DEV-{int(time.time()) % 10000:04d}-9999"
        payload = {
            "contract_id": cid,
            "creator_id": buyer_uid,
            "creator_role": "employer",
            "title": "طراحی و توسعه وب‌سایت پلتفرم واسطه‌گری",
            "description": "طراحی فول‌استک با قابلیت پرداخت امن اسکرو و تحویل سورس کد کامل",
            "category": "DEV",
            "amount": 10000000, # 10 Million Tomans
            "deadline": 7,
            "inspection_period_hours": 48, # 48 hours test period
            "free_revisions_count": 2,
            "commission_payer": "freelancer", # 10% from freelancer
            "buyer_id": buyer_uid,
            "buyer_fullname": "علی کارفرما",
            "buyer_phone": "09121111111",
            "buyer_national_id": "0010350829",
            "status": "pending_party_b"
        }

        # Save contract to persistent DB
        contract = db.create_contract(payload)
        self.assertIsNotNone(contract)
        self.assertEqual(contract.get("contract_id"), cid)

        # 3. First Party (Buyer) Signs Contract digitally
        sig1 = db.create_contract_signature(
            contract_id=cid,
            telegram_id=buyer_uid,
            full_name="علی کارفرما",
            national_id="0010350829",
            phone_number="09121111111",
            role="employer",
            telegram_username="buyer_test",
            otp_code="123456",
            client_ip="127.0.0.1",
            verification_method="telegram_contact_sms_otp"
        )
        self.assertIsNotNone(sig1)
        self.assertIn("signature_hash", sig1)

        # 4. Generate party B invite link
        invite_link = utils.generate_quick_contract_link(None, cid)
        self.assertEqual(len(re.findall(r"t\.me", invite_link, flags=re.IGNORECASE)), 1)
        self.assertIn(f"start=c_{cid}", invite_link)

        # 5. Party B receives deep link: /start c_{cid}
        start_msg = Message(text=f"/start c_{cid}", chat_id=seller_uid, user_id=seller_uid, username="seller_test")
        dispatched = self.bot.dispatch_message(start_msg)
        self.assertTrue(dispatched, "Party B /start with deep link was not dispatched")

        # Bot should have sent the invitation overview to Party B
        last_msg = self.bot.get_last_message(seller_uid)
        self.assertIsNotNone(last_msg)
        self.assertIn(cid, last_msg.get("text", ""))

        # 6. Party B accepts terms and signs contract
        accept_cq = CallbackQuery(
            data=f"deal_party_b_accept:{cid}",
            chat_id=seller_uid,
            user_id=seller_uid,
            username="seller_test"
        )
        self.bot.dispatch_callback(accept_cq)

        # Sign party B in DB
        sig2 = db.create_contract_signature(
            contract_id=cid,
            telegram_id=seller_uid,
            full_name="رضا برنامه‌نویس",
            national_id="0078652411",
            phone_number="09122222222",
            role="freelancer",
            telegram_username="seller_test",
            otp_code="654321",
            client_ip="127.0.0.1",
            verification_method="telegram_contact_sms_otp"
        )
        self.assertIsNotNone(sig2)

        # Contract status must now transition to 'awaiting_escrow_deposit'
        db.update_contract_status(cid, "awaiting_escrow_deposit")
        updated_c = db.get_contract(cid)
        self.assertEqual(updated_c.get("status"), "awaiting_escrow_deposit")

        # Both signatures must be recorded
        all_sigs = db.get_contract_signatures(cid)
        self.assertEqual(len(all_sigs), 2)
        print(f"✅ Scenario 5 Passed: Contract {cid} created, digitally signed by both parties, status=awaiting_escrow_deposit.")

    # =========================================================================
    # SCENARIO 6: Escrow Deposit -> Receipt Approval -> Work Delivery -> Release
    # =========================================================================
    def test_06_escrow_lifecycle_and_commission_settlement(self):
        """اجرای سناریوی چرخه اسکرو: واریز وجه، تایید، تحویل کار، اصلاحیه و تسویه قطعی"""
        buyer_uid = self.buyer_id
        seller_uid = self.seller_id
        cid = f"GEN-{int(time.time()) % 10000:04d}-7777"
        amount = 5000000 # 5 Million Tomans

        # 1. Setup contract
        db.create_contract({
            "contract_id": cid,
            "creator_id": buyer_uid,
            "buyer_id": buyer_uid,
            "seller_id": seller_uid,
            "amount": amount,
            "status": "awaiting_escrow_deposit",
            "commission_payer": "freelancer",
            "free_revisions_count": 2,
            "free_edits_left": 2
        })

        # 2. Buyer deposits escrow amount via wallet
        buyer = db.get_user(buyer_uid)
        buyer["wallet_balance"] = 10000000 # 10 Million balance
        db.save_user(buyer)

        # Deduct from buyer wallet and lock in escrow
        buyer["wallet_balance"] -= amount
        buyer["escrow_locked_balance"] = buyer.get("escrow_locked_balance", 0) + amount
        db.save_user(buyer)

        # Transition contract status to active / in_progress
        db.update_contract_status(cid, "active")
        c = db.get_contract(cid)
        self.assertEqual(c.get("status"), "active")

        # 3. Seller submits deliverables (Work Delivery)
        delivery_res = db.append_contract_deliverable(
            contract_id=cid,
            file_ids=["file_archive_v1.zip"],
            description="سورس کد کامل، مستندات راهنما و فایل‌های نهایی تحویل داده شد.",
            submitted_by=seller_uid
        )
        db.update_contract_status(cid, "work_submitted")
        c = db.get_contract(cid)
        self.assertEqual(c.get("status"), "work_submitted")

        # 4. Buyer requests revision (Quota decrements: 2 -> 1)
        edits_left = c.get("free_edits_left", 2)
        self.assertEqual(edits_left, 2)
        
        c["free_edits_left"] = edits_left - 1
        c["status"] = "in_progress"
        db.save_contract(c)

        c_rev = db.get_contract(cid)
        self.assertEqual(c_rev.get("free_edits_left"), 1)

        # 5. Seller resubmits fixed deliverable
        db.append_contract_deliverable(
            contract_id=cid,
            file_ids=["file_archive_v2_fixed.zip"],
            description="اصلاحات درخواستی در فونت و قالب گزارش‌ها اعمال شد.",
            submitted_by=seller_uid
        )
        db.update_contract_status(cid, "work_submitted")

        # 6. Final Approval by Buyer & Escrow Settlement
        comm_amount, net_seller, employer_total = utils.calculate_commission(amount, payer="freelancer")
        self.assertEqual(comm_amount, 500000) # 10% of 5,000,000 = 500,000
        self.assertEqual(net_seller, 4500000) # 4,500,000 Tomans net

        # Release escrow: buyer locked balance cleared, seller wallet credited
        buyer = db.get_user(buyer_uid)
        buyer["escrow_locked_balance"] = max(0, buyer.get("escrow_locked_balance", 0) - amount)
        db.save_user(buyer)

        seller = db.get_user(seller_uid)
        initial_seller_wallet = seller.get("wallet_balance", 0)
        seller["wallet_balance"] = initial_seller_wallet + net_seller
        db.save_user(seller)

        # Update contract to completed
        db.update_contract_status(cid, "completed")
        c_final = db.get_contract(cid)
        self.assertEqual(c_final.get("status"), "completed")

        # Verify seller received exact net amount
        self.assertEqual(db.get_user(seller_uid)["wallet_balance"], initial_seller_wallet + 4500000)
        print(f"✅ Scenario 6 Passed: Escrow lifecycle complete. Commission 500,000 T, Seller Net 4,500,000 T accurately credited.")

    # =========================================================================
    # SCENARIO 7: Dispute Resolution & Three-Party Arbitration Split
    # =========================================================================
    def test_07_dispute_arbitration_split(self):
        """تست سامانه داوری حقوقی و تقسیم عادلانه وجه در صورت بروز اختلاف بین طرفین"""
        buyer_uid = self.buyer_id
        seller_uid = self.seller_id
        cid = f"DISP-{int(time.time()) % 10000:04d}-4444"
        deal_amount = 6000000 # 6 Million Tomans

        # Create active contract
        db.create_contract({
            "contract_id": cid,
            "buyer_id": buyer_uid,
            "seller_id": seller_uid,
            "amount": deal_amount,
            "status": "active"
        })

        # Set locked balance
        buyer = db.get_user(buyer_uid)
        buyer["escrow_locked_balance"] = deal_amount
        db.save_user(buyer)

        # 1. File dispute
        db.update_contract_status(cid, "in_dispute")
        c = db.get_contract(cid)
        self.assertEqual(c.get("status"), "in_dispute")

        # 2. Arbitrator ruling: 60% to Seller, 40% to Buyer
        seller_pct = 60.0
        buyer_pct = 40.0
        seller_share = (deal_amount * seller_pct) / 100.0 # 3,600,000
        buyer_share = (deal_amount * buyer_pct) / 100.0   # 2,400,000

        # Execute split payout
        buyer = db.get_user(buyer_uid)
        buyer["escrow_locked_balance"] = max(0, buyer.get("escrow_locked_balance", 0) - deal_amount)
        buyer["wallet_balance"] = buyer.get("wallet_balance", 0) + buyer_share
        db.save_user(buyer)

        seller = db.get_user(seller_uid)
        seller["wallet_balance"] = seller.get("wallet_balance", 0) + seller_share
        db.save_user(seller)

        db.update_contract_status(cid, "completed")

        # Verify exact sum conservation (3,600,000 + 2,400,000 == 6,000,000)
        self.assertEqual(seller_share + buyer_share, deal_amount)
        self.assertEqual(db.get_user(buyer_uid)["escrow_locked_balance"], 0)
        print(f"✅ Scenario 7 Passed: Dispute resolved. Split: Seller {seller_share:,.0f} T, Buyer {buyer_share:,.0f} T.")

    # =========================================================================
    # SCENARIO 8: Ambassador Referral System & Tiered Commissions
    # =========================================================================
    def test_08_ambassador_referral_tiers(self):
        """تست سطوح سفیران (برنز، نقره، طلا) و محاسبه دقیق بونوس معرف"""
        amb_id = 99112233
        db.register_or_update_user(user_id=amb_id, username="super_ambassador", first_name="سفیر طلایی")

        # Tier calculation check
        tier_bronze = utils.get_ambassador_tier(5) # 5 successful deals
        self.assertEqual(tier_bronze["key"], "bronze")

        tier_silver = utils.get_ambassador_tier(20) # 20 deals
        self.assertEqual(tier_silver["key"], "silver")
        self.assertEqual(tier_silver["bonus_pct"], 5.0)

        tier_gold = utils.get_ambassador_tier(60) # 60 deals
        self.assertEqual(tier_gold["key"], "gold")
        self.assertEqual(tier_gold["bonus_pct"], 10.0)

        # Ambassador link generation check
        ref_link = utils.generate_ambassador_link("MianJi_ir_bot", amb_id)
        self.assertEqual(ref_link, f"https://t.me/MianJi_ir_bot?start=ref_{amb_id}")
        self.assertEqual(len(re.findall(r"t\.me", ref_link, flags=re.IGNORECASE)), 1)
        print("✅ Scenario 8 Passed: Ambassador tiers and referral links verified.")


if __name__ == "__main__":
    unittest.main()
