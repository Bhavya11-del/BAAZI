import { getApps } from 'firebase-admin';
import { getAuth } from 'firebase-admin/auth';

export interface SocialProfile {
  provider: string;
  providerId: string;
  email: string;
  name: string;
  avatar: string;
}

interface SocialAuthProvider {
  verify(token: string): Promise<SocialProfile>;
}

class FirebaseProvider implements SocialAuthProvider {
  async verify(token: string): Promise<SocialProfile> {
    if (!getApps().length) {
      throw Object.assign(new Error('Firebase Admin unavailable — check server env configuration'), { code: 'app/no-app' });
    }
    const decoded = await getAuth().verifyIdToken(token);
    console.log('[TRACE FirebaseProvider.verify] decoded token:', JSON.stringify({ uid: decoded.uid, email: decoded.email, name: decoded.name, picture: decoded.picture }, null, 2));
    if (!decoded.email) {
      throw new Error('Firebase account has no email');
    }
    const profile: SocialProfile = {
      provider: 'firebase',
      providerId: decoded.uid,
      email: decoded.email,
      name: decoded.name || decoded.email!.split('@')[0],
      avatar: decoded.picture || `https://api.dicebear.com/7.x/avataaars/svg?seed=${decoded.email}`,
    };
    console.log('[TRACE FirebaseProvider.verify] returning profile:', JSON.stringify(profile, null, 2));
    return profile;
  }
}

class SocialAuthManager {
  private providers = new Map<string, SocialAuthProvider>();

  register(name: string, provider: SocialAuthProvider) {
    this.providers.set(name, provider);
  }

  async verify(providerName: string, token: string): Promise<SocialProfile> {
    const provider = this.providers.get(providerName);
    if (!provider) {
      throw new Error(`Unsupported social auth provider: ${providerName}`);
    }
    return provider.verify(token);
  }
}

export const socialAuthManager = new SocialAuthManager();

socialAuthManager.register('firebase', new FirebaseProvider());
