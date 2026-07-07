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

class GoogleProvider implements SocialAuthProvider {
  async verify(token: string): Promise<SocialProfile> {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'Unknown error');
      throw new Error(`Google token verification failed: ${errorText}`);
    }
    const data: Record<string, any> = await response.json();
    if (!data.email) {
      throw new Error('Google account has no email');
    }
    return {
      provider: 'google',
      providerId: data.sub as string,
      email: data.email as string,
      name: (data.name as string) || (data.email as string).split('@')[0],
      avatar: (data.picture as string) || `https://api.dicebear.com/7.x/avataaars/svg?seed=${data.email}`,
    };
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

socialAuthManager.register('google', new GoogleProvider());
