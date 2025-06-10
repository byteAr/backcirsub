export const EnvConfiguration = () => ({
    twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    phoneNumber: process.env.TWILIO_PHONE_NUMBER,
  },
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
  },
  otp: {
    expirySeconds: parseInt(process.env.OTP_EXPIRY_SECONDS || '300', 10), // 5 minutos por defecto
    codeLength: parseInt(process.env.OTP_CODE_LENGTH || '6', 10),
  },
    enviroment: process.env.NODE_ENV || 'dev',
    port: process.env.PORT || 3000
})