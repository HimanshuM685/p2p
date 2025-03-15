import {PeerActionType} from "./peerTypes";
import {Dispatch} from "redux";
import {DataType, PeerConnection} from "../../helpers/peer";
import {message} from "antd";
import {addConnectionList, removeConnectionList} from "../connection/connectionActions";
import download from "js-file-download";
import { FileChunkManager } from "../../helpers/fileChunkManager";

export const startPeerSession = (id: string) => ({
    type: PeerActionType.PEER_SESSION_START, id
})

export const stopPeerSession = () => ({
    type: PeerActionType.PEER_SESSION_STOP,
})
export const setLoading = (loading: boolean) => ({
    type: PeerActionType.PEER_LOADING, loading
})

export const startPeer: () => (dispatch: Dispatch) => Promise<void>
    = () => (async (dispatch) => {
    dispatch(setLoading(true))
    try {
        const id = await PeerConnection.startPeerSession()
        PeerConnection.onIncomingConnection((conn) => {
            const peerId = conn.peer
            message.info("Incoming connection: " + peerId)
            dispatch(addConnectionList(peerId))
            PeerConnection.onConnectionDisconnected(peerId, () => {
                message.info("Connection closed: " + peerId)
                dispatch(removeConnectionList(peerId))
            })
            
            PeerConnection.onConnectionReceiveData(peerId, (data) => {
                const fileManager = FileChunkManager.getInstance();
                
                if (data.dataType === DataType.FILE) {
                    // for small files
                    message.info("Receiving file " + data.fileName + " from " + peerId)
                    download(data.file || '', data.fileName || "fileName", data.fileType)
                } 
                else if (data.dataType === DataType.FILE_CHUNK && data.fileId) {
                    // 1st chunk with metadata only
                    if (data.chunkIndex === undefined && data.totalChunks) {
                        fileManager.initFileTransfer(
                            data.fileId,
                            data.fileName || "unknown",
                            data.fileType || "application/octet-stream",
                            data.totalChunks
                        );
                        message.info(`Starting to receive "${data.fileName}" from ${peerId}`);
                    }
                    // for larger file
                    else if (data.chunkIndex !== undefined && data.file) {
                        const isComplete = fileManager.addChunk(data.fileId, data.chunkIndex, data.file);
                        
                        // progress for large files
                        if (data.totalChunks && data.totalChunks > 10) {
                            const progress = Math.round((data.chunkIndex / data.totalChunks) * 100);
                            if (progress % 2 === 0) { // for every 2% progress
                                message.info(`Receiving "${data.fileName}": ${progress}% complete`);
                            }
                        }
                    }
                }
                else if (data.dataType === DataType.FILE_COMPLETE && data.fileId) {
                    // transfer completed
                    const fileManager = FileChunkManager.getInstance();
                    fileManager.assembleAndDownloadFile(data.fileId)
                        .then(success => {
                            if (success) {
                                message.success(`File "${data.fileName}" downloaded successfully`);
                            } else {
                                message.error(`Error downloading file "${data.fileName}"`);
                            }
                        });
                }
            })
        })
        
        dispatch(startPeerSession(id))
        dispatch(setLoading(false))
    } catch (err) {
        console.log(err)
        dispatch(setLoading(false))
    }
})


