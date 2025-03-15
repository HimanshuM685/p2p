import {ConnectionActionType} from "./connectionTypes";
import {Dispatch} from "redux";
import {DataType, PeerConnection} from "../../helpers/peer";
import {message} from "antd";
import { FileChunkManager } from "../../helpers/fileChunkManager";
import { EncryptionManager } from "../../helpers/encryption";

export const changeConnectionInput = (id: string) => ({
    type: ConnectionActionType.CONNECTION_INPUT_CHANGE, id
})

export const setLoading = (loading: boolean) => ({
    type: ConnectionActionType.CONNECTION_CONNECT_LOADING, loading
})
export const addConnectionList = (id: string) => ({
    type: ConnectionActionType.CONNECTION_LIST_ADD, id
})

export const removeConnectionList = (id: string) => ({
    type: ConnectionActionType.CONNECTION_LIST_REMOVE, id
})

export const selectItem = (id: string) => ({
    type: ConnectionActionType.CONNECTION_ITEM_SELECT, id
})

export const connectPeer: (id: string) => (dispatch: Dispatch) => Promise<void>
    = (id: string) => (async (dispatch) => {
    dispatch(setLoading(true))
    try {
        await PeerConnection.connectPeer(id)
        PeerConnection.onConnectionDisconnected(id, () => {
            message.info("Connection closed: " + id)
            dispatch(removeConnectionList(id))
        })
        
        PeerConnection.onConnectionReceiveData(id, (data) => {
            const fileManager = FileChunkManager.getInstance();
            
            if (data.dataType === DataType.FILE) {
                message.info("Receiving file " + data.fileName + " from " + id)
                if (data.file) {
                    const encryptionManager = EncryptionManager.getInstance();
                    const key = encryptionManager.getKeyForPeer(id);
                    if (!key) {
                        throw new Error("Encryption key not found for peer");
                    }
                    const arrayBuffer = data.file.arrayBuffer();
                    if (!data.iv) {
                        throw new Error("Initialization vector (iv) is undefined");
                    }
                    arrayBuffer.then(buffer => {
                        if (data.iv) {
                            encryptionManager.decryptData(buffer, data.iv, key).then(decryptedData => {
                                const decryptedBlob = new Blob([decryptedData], { type: data.fileType });
                                fileManager.downloadFile(decryptedBlob, (data.fileName || "defaultFileName"), DataType.FILE);
                            }).catch(err => {
                                console.error("Error decrypting file data:", err);
                            });
                        } else {
                            console.error("Initialization vector (iv) is undefined");
                        }
                    }).catch(err => {
                        console.error("Error reading file data:", err);
                    });
                } else {
                    console.error("Received file data is undefined");
                }
            }
        })
        
        dispatch(addConnectionList(id))
        dispatch(setLoading(false))
    } catch (err) {
        dispatch(setLoading(false))
        console.log(err)
    }
})


