const jwt = require('jsonwebtoken');

class JWTHelper {
    constructor() {
        this.jwtSecret = process.env.JWT_SECRET;
        if (!this.jwtSecret) {
            throw new Error('JWT_SECRET environment variable is required');
        }
    }

    // Generate access token (15 minutes)
    generateAccessToken(payload) {
        return jwt.sign(payload, this.jwtSecret, { expiresIn: '15m' });
    }

    // Generate refresh token (7 days)
    generateRefreshToken(payload) {
        return jwt.sign(payload, this.jwtSecret, { expiresIn: '7d' });
    }

    // Generate both tokens for user authentication
    generateTokenPair(user) {
        const payload = {
            id: user._id,
            email: user.email,
            role: user.role || 'user'
        };

        const accessToken = this.generateAccessToken(payload);
        const refreshToken = this.generateRefreshToken({ id: user._id });

        return {
            token: accessToken,
            refreshToken,
            expiresIn: 15 * 60 // 15 minutes in seconds
        };
    }

    // Verify token
    verifyToken(token) {
        return new Promise((resolve, reject) => {
            jwt.verify(token, this.jwtSecret, (err, decoded) => {
                if (err) {
                    reject(err);
                } else {
                    resolve(decoded);
                }
            });
        });
    }

    // Get token expiration info
    getTokenInfo(token) {
        try {
            const decoded = jwt.decode(token);
            return {
                exp: decoded.exp,
                iat: decoded.iat,
                expiresAt: new Date(decoded.exp * 1000),
                issuedAt: new Date(decoded.iat * 1000)
            };
        } catch (error) {
            throw new Error('Invalid token format');
        }
    }
}

// Export singleton instance
module.exports = new JWTHelper();