
const jwt = require('jsonwebtoken');

// Mock the JWT_SECRET before all tests
beforeAll(() => {
  process.env.JWT_SECRET = 'a-super-secret-key-for-testing';
});

describe('JWTHelper', () => {
  let jwtHelper; // Declare jwtHelper here

  beforeEach(() => {
    jest.resetModules(); // Reset module registry to allow re-importing jwt.helper
    // Import jwt.helper.js *after* JWT_SECRET is set
    // This ensures the JWTHelper instance is created with the mocked secret
    jwtHelper = require('../jwt.helper');
  });
  const userPayload = { id: '12345', email: 'test@example.com', role: 'user' };

  describe('generateAccessToken', () => {
    it('should generate a valid JWT access token', () => {
      const token = jwtHelper.generateAccessToken(userPayload);
      
      // Check that the token is a string
      expect(typeof token).toBe('string');
      
      // Verify the token to check its payload
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      
      // Check that the payload matches what we sent, ignoring 'iat' and 'exp'
      expect(decoded.id).toBe(userPayload.id);
      expect(decoded.email).toBe(userPayload.email);
      expect(decoded.role).toBe(userPayload.role);
    });
  });

  describe('generateTokenPair', () => {
    it('should generate an object with token, refreshToken, and expiresIn', () => {
      const user = { _id: '12345', email: 'test@example.com', role: 'user' };
      const tokenPair = jwtHelper.generateTokenPair(user);

      expect(tokenPair).toHaveProperty('token');
      expect(tokenPair).toHaveProperty('refreshToken');
      expect(tokenPair.expiresIn).toBe(900); // 15 minutes in seconds

      // Verify the access token
      const decodedAccessToken = jwt.verify(tokenPair.token, process.env.JWT_SECRET);
      expect(decodedAccessToken.id).toBe(user._id);

      // Verify the refresh token
      const decodedRefreshToken = jwt.verify(tokenPair.refreshToken, process.env.JWT_SECRET);
      expect(decodedRefreshToken.id).toBe(user._id);
    });
  });

  describe('verifyToken', () => {
    it('should resolve with the decoded payload for a valid token', async () => {
      const token = jwt.sign(userPayload, process.env.JWT_SECRET, { expiresIn: '1m' });
      
      const decoded = await jwtHelper.verifyToken(token);
      
      expect(decoded.id).toBe(userPayload.id);
      expect(decoded.email).toBe(userPayload.email);
    });

    it('should reject for an invalid or expired token', async () => {
      const expiredToken = jwt.sign(userPayload, process.env.JWT_SECRET, { expiresIn: '-1s' });
      const invalidSignatureToken = jwt.sign(userPayload, 'wrong-secret');
      
      // Using .catch for async rejection testing
      await expect(jwtHelper.verifyToken(expiredToken)).rejects.toThrow('jwt expired');
      await expect(jwtHelper.verifyToken(invalidSignatureToken)).rejects.toThrow('invalid signature');
      await expect(jwtHelper.verifyToken('not-a-token')).rejects.toThrow('jwt malformed');
    });
  });

  describe('getTokenInfo', () => {
    it('should return decoded token information without verifying signature', () => {
        const token = jwt.sign(userPayload, process.env.JWT_SECRET, { expiresIn: '1m' });
        const tokenInfo = jwtHelper.getTokenInfo(token);

        expect(tokenInfo).toHaveProperty('exp');
        expect(tokenInfo).toHaveProperty('iat');
        
        // Check if the dates are valid
        expect(tokenInfo.expiresAt).toBeInstanceOf(Date);
        expect(tokenInfo.issuedAt).toBeInstanceOf(Date);
        expect(tokenInfo.expiresAt.getTime()).toBeGreaterThan(tokenInfo.issuedAt.getTime());
    });

    it('should throw an error for an invalid token format', () => {
        expect(() => {
            jwtHelper.getTokenInfo('this-is-not-a-valid-token');
        }).toThrow('Invalid token format');
    });
  });
});
