export class EncryptionManager {
  private static instance: EncryptionManager;
  private keyMap: Map<string, CryptoKey> = new Map();
  
  private constructor() {}
  
  public static getInstance(): EncryptionManager {
    if (!EncryptionManager.instance) {
      EncryptionManager.instance = new EncryptionManager();
    }
    return EncryptionManager.instance;
  }
  
 // Key Gen
  public async generateKey(): Promise<CryptoKey> {
    return window.crypto.subtle.generateKey(
      {
        name: "AES-GCM",
        length: 256,
      },
      true,
      ["encrypt", "decrypt"]
    );
  }
  
  public async exportKey(key: CryptoKey): Promise<ArrayBuffer> {
    return window.crypto.subtle.exportKey("raw", key);
  }
  
  public async importKey(keyData: ArrayBuffer): Promise<CryptoKey> {
    return window.crypto.subtle.importKey(
      "raw",
      keyData,
      {
        name: "AES-GCM",
        length: 256,
      },
      true,
      ["encrypt", "decrypt"]
    );
  }


  public storeKeyForPeer(peerId: string, key: CryptoKey): void {
    this.keyMap.set(peerId, key);
  }


  public getKeyForPeer(peerId: string): CryptoKey | undefined {
    return this.keyMap.get(peerId);
  }
 

  public async encryptData(data: ArrayBuffer, key: CryptoKey): Promise<{ encrypted: ArrayBuffer, iv: Uint8Array }> {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    
    const encrypted = await window.crypto.subtle.encrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      data
    );
    
    return {
      encrypted,
      iv
    };
  }
  
  public async decryptData(encryptedData: ArrayBuffer, iv: Uint8Array, key: CryptoKey): Promise<ArrayBuffer> {
    return window.crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: iv
      },
      key,
      encryptedData
    );
  }
}