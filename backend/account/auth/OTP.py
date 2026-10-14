import pyotp
from django.utils import timezone
from datetime import timedelta
import os


# OTPs stay valid for 20 minutes. The authoritative check is the created_at
# comparison in isOTPExpired; the TOTP interval only has to be wide enough not
# to reject a code before that deadline.
DEFAULT_OTP_EXPIRY_SECONDS = 20 * 60


def getOTPExpirySeconds():
    try:
        seconds = int(os.environ.get("OTP_EXPIRY_SECONDS") or DEFAULT_OTP_EXPIRY_SECONDS)
    except (TypeError, ValueError):
        seconds = DEFAULT_OTP_EXPIRY_SECONDS
    return seconds if seconds > 0 else DEFAULT_OTP_EXPIRY_SECONDS


class BaseOTP:
    def totp(self, secret):
        return pyotp.TOTP(secret, interval=getOTPExpirySeconds())

    def generateOTP(self):
        self.secret = pyotp.random_base32()
        self.otp = self.totp(self.secret).now()
        return self.otp, self.secret

    def isOTPExpired(self, user):
        return (timezone.now() - user.created_at) > timedelta(
            seconds=getOTPExpirySeconds()
        )

    def verifyOTP(self, user, user_otp):
        try:
            # valid_window=1 keeps a code minted near the end of a time step
            # from dying early; isOTPExpired enforces the real deadline.
            return self.totp(user.secret).verify(user_otp, valid_window=1)
        except Exception as e:
            return False
