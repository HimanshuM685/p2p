import {ConnectionActionType} from "./connectionTypes";
import {Dispatch} from "redux";
import {DataType, PeerConnection} from "../../helpers/peer";
import {message} from "antd";
import download from "js-file-download";
import { FileChunkManager } from "../../helpers/fileChunkManager";

export const changeConnectionInput = (id: string) => ({
    type: ConnectionActionType.CONNECTION_INPUT_CHANGE, id
})

export const setLoading = (loading: boolean) => ({
    type: ConnectionActionType.CONNECTION_LOADING, loading
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

// Add new action types for receive progress
export const setReceiveProgress = (progress: number, show: boolean) => ({
    type: ConnectionActionType.RECEIVE_PROGRESS_UPDATE,
    payload: { progress, show }
});

export const connectPeer: (id: string) => (dispatch: Dispatch) => Promise<void>
    = (id: string) => (async (dispatch) => {
    dispatch(setLoading(true))
    try {
        // Check if we're already connected to this peer
        const peer = PeerConnection.getPeer();
        if (peer?.connections) {
            const connections = peer.connections as Record<string, any[]>;
            if (connections[id]?.length > 0) {
                dispatch(setLoading(false));
                message.warning("Already connected to this peer");
                return;
            }
        }

        await PeerConnection.connectPeer(id)
        PeerConnection.onConnectionDisconnected(id, () => {
            message.info("Connection closed: " + id)
            dispatch(removeConnectionList(id))
            dispatch(setReceiveProgress(0, false))
        })
        
        PeerConnection.onConnectionReceiveData(id, (data) => {
            const fileManager = FileChunkManager.getInstance();
            
            if (data.dataType === DataType.FILE) {
                // Handle simple file download (small files)
                dispatch(setReceiveProgress(0, true));
                message.info("Receiving file " + data.fileName + " from " + id);
                download(data.file || '', data.fileName || "fileName", data.fileType);
                // Show 100% progress briefly before hiding
                dispatch(setReceiveProgress(100, true));
                setTimeout(() => {
                    dispatch(setReceiveProgress(0, false));
                }, 1000);
            }
            else if (data.dataType === DataType.FILE_CHUNK && data.fileId) {
                // First chunk with metadata only
                if (data.chunkIndex === undefined && data.totalChunks) {
                    fileManager.initFileTransfer(
                        data.fileId,
                        data.fileName || "unknown",
                        data.fileType || "application/octet-stream",
                        data.totalChunks
                    );
                    dispatch(setReceiveProgress(0, true));
                    message.info(`Starting to receive "${data.fileName}" from ${id}`);
                }
                // Handle chunk of a larger file
                else if (data.chunkIndex !== undefined && data.file) {
                    const isComplete = fileManager.addChunk(data.fileId, data.chunkIndex, data.file);
                    
                    // Show progress for large files
                    if (data.totalChunks) {
                        const progress = Math.round((data.chunkIndex / data.totalChunks) * 100);
                        dispatch(setReceiveProgress(progress, true));
                        if (progress % 20 === 0) { // Show at 20% intervals
                            message.info(`Receiving "${data.fileName}": ${progress}% complete`);
                        }
                    }
                }
            }
            else if (data.dataType === DataType.FILE_COMPLETE && data.fileId) {
                // File transfer completed
                const fileManager = FileChunkManager.getInstance();
                fileManager.assembleAndDownloadFile(data.fileId)
                    .then(success => {
                        if (success) {
                            dispatch(setReceiveProgress(100, true));
                            setTimeout(() => {
                                dispatch(setReceiveProgress(0, false));
                            }, 1000);
                            message.success(`File "${data.fileName}" downloaded successfully`);
                        } else {
                            dispatch(setReceiveProgress(0, false));
                            message.error(`Error downloading file "${data.fileName}"`);
                        }
                    });
            }
        })
        
        dispatch(addConnectionList(id))
        dispatch(setLoading(false))
        message.success("Connected to peer: " + id);
    } catch (err: any) {
        console.log(err)
        dispatch(setLoading(false))
        dispatch(setReceiveProgress(0, false))
        
        // Provide more specific error messages
        if (err.type === 'peer-unavailable') {
            message.error("Peer not found or offline. Check the ID and try again.");
        } else if (err.type === 'disconnected') {
            message.error("Connection failed. The peer may be offline.");
        } else if (err.message?.includes("Connection existed")) {
            message.error("Already connected to this peer.");
        } else {
            message.error("Failed to connect: " + (err.message || "Unknown error"));
        }
    }
})


