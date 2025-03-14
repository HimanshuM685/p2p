import Peer, { DataConnection, PeerErrorType, PeerError } from "peerjs";
import { message } from "antd";

export enum DataType {
    FILE = 'FILE',
    FILE_CHUNK = 'FILE_CHUNK',
    FILE_COMPLETE = 'FILE_COMPLETE',
    OTHER = 'OTHER'
}

export interface Data {
    dataType: DataType;
    file?: Blob;
    fileName?: string;
    fileType?: string;
    message?: string;
    // Chunk metadata
    chunkIndex?: number;
    totalChunks?: number;
    fileId?: string; // To identify chunks belonging to the same file
}

let peer: Peer | undefined;
let connectionMap: Map<string, DataConnection> = new Map<string, DataConnection>();

export const PeerConnection = {
    getPeer: () => peer,
    startPeerSession: () => new Promise<string>((resolve, reject) => {
        try {
            peer = new Peer({
                config: {
                    iceServers: [
                        { urls: 'stun:stun.l.google.com:19302' },
                        {
                            urls: 'turn:ss-turn2.xirsys.com:80?transport=udp',
                            username: 'your-username',
                            credential: 'your-credential'
                        }
                    ]
                }
            });
            peer.on('open', (id) => {
                console.log('My ID: ' + id);
                resolve(id);
            }).on('error', (err) => {
                console.log(err);
                message.error(err.message);
            });
        } catch (err) {
            console.log(err);
            reject(err);
        }
    }),
    closePeerSession: () => new Promise<void>((resolve, reject) => {
        try {
            if (peer) {
                peer.destroy();
                peer = undefined;
            }
            resolve();
        } catch (err) {
            console.log(err);
            reject(err);
        }
    }),
    connectPeer: (id: string) => new Promise<void>((resolve, reject) => {
        if (!peer) {
            reject(new Error("Peer doesn't start yet"));
            return;
        }
        if (connectionMap.has(id)) {
            reject(new Error("Connection existed"));
            return;
        }
        try {
            let conn = peer.connect(id, { reliable: true });
            if (!conn) {
                reject(new Error("Connection can't be established"));
            } else {
                conn.on('open', function () {
                    console.log("Connect to: " + id);
                    connectionMap.set(id, conn);
                    peer?.removeListener('error', handlePeerError);
                    resolve();
                }).on('error', function (err) {
                    console.log(err);
                    peer?.removeListener('error', handlePeerError);
                    reject(err);
                });

                const handlePeerError = (err: PeerError<`${PeerErrorType}`>) => {
                    if (err.type === 'peer-unavailable') {
                        const messageSplit = err.message.split(' ');
                        const peerId = messageSplit[messageSplit.length - 1];
                        if (id === peerId) reject(err);
                    }
                };
                peer.on('error', handlePeerError);
            }
        } catch (err) {
            reject(err);
        }
    }),
    onIncomingConnection: (callback: (conn: DataConnection) => void) => {
        peer?.on('connection', function (conn) {
            console.log("Incoming connection: " + conn.peer);
            connectionMap.set(conn.peer, conn);
            callback(conn);
        });
    },
    onConnectionDisconnected: (id: string, callback: () => void) => {
        if (!peer) {
            throw new Error("Peer doesn't start yet");
        }
        if (!connectionMap.has(id)) {
            throw new Error("Connection didn't exist");
        }
        let conn = connectionMap.get(id);
        if (conn) {
            conn.on('close', function () {
                console.log("Connection closed: " + id);
                connectionMap.delete(id);
                callback();
            });
        }
    },
    sendConnection: (id: string, data: Data, onProgress: (progress: number) => void): Promise<void> => new Promise((resolve, reject) => {
        if (!connectionMap.has(id)) {
            reject(new Error("Connection didn't exist"));
            return; // Add early return
        }
        try {
            let conn = connectionMap.get(id);
            if (!conn) { // More explicit check
                reject(new Error("Connection didn't exist"));
                return;
            }
            
            const chunkSize = 16 * 1024; // 16KB
            
            // Only chunk if it's a file and larger than chunkSize
            if (data.dataType === DataType.FILE && data.file && data.file.size > chunkSize) {
                const file = data.file as Blob;
                const totalChunks = Math.ceil(file.size / chunkSize);
                let currentChunk = 0;
                const fileId = Date.now().toString(); // Simple unique ID for the file
                
                // First send metadata to prepare receiver
                conn.send({
                    dataType: DataType.FILE_CHUNK,
                    fileName: data.fileName,
                    fileType: data.fileType,
                    fileId: fileId,
                    totalChunks: totalChunks
                });

                const sendChunk = () => {
                    if (currentChunk < totalChunks) {
                        const start = currentChunk * chunkSize;
                        const end = Math.min(start + chunkSize, file.size);
                        const chunk = file.slice(start, end);
                        
                        if (conn) {
                            conn.send({
                                dataType: DataType.FILE_CHUNK,
                                file: chunk,
                                chunkIndex: currentChunk,
                                totalChunks: totalChunks,
                                fileId: fileId
                            });
                            currentChunk++;
                            onProgress((currentChunk / totalChunks) * 100);
                            setTimeout(sendChunk, 100); // Simulate network delay
                        } else {
                            reject(new Error("Connection lost"));
                        }
                    } else {
                        // Fix: Add null check before using conn
                        if (conn) {  // <- Add this check
                            conn.send({
                                dataType: DataType.FILE_COMPLETE,
                                fileId: fileId
                            });
                            resolve();
                        } else {
                            reject(new Error("Connection lost"));
                        }
                    }
                };

                sendChunk();
            } else {
                conn.send(data);
                onProgress(100);
                resolve();
            }
        } catch (err) {
            reject(err);
        }
    }),
    onConnectionReceiveData: (id: string, callback: (f: Data) => void) => {
        if (!peer) {
            throw new Error("Peer doesn't start yet");
        }
        if (!connectionMap.has(id)) {
            throw new Error("Connection didn't exist");
        }
        let conn = connectionMap.get(id);
        if (conn) {
            conn.on('data', function (receivedData) {
                console.log("Receiving data from " + id);
                callback(receivedData as Data);
            });
        }
    }
};