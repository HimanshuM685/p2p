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
            let startTime = Date.now();
            let totalSize = 0;
            
            if (data.dataType === DataType.FILE) {
                // Handle simple file download (small files)
                message.info("Receiving file " + data.fileName + " from " + id)
                download(data.file || '', data.fileName || "fileName", data.fileType)
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
                    message.info(`Starting to receive "${data.fileName}" from ${id}`);
                }
                // Handle chunk of a larger file
                else if (data.chunkIndex !== undefined && data.file) {
                    const isComplete = fileManager.addChunk(data.fileId, data.chunkIndex, data.file);
                    totalSize += data.file.size;
                    
                    // Show progress for large files
                    if (data.totalChunks && data.totalChunks > 10) {
                        const progress = Math.round((data.chunkIndex / data.totalChunks) * 100);
                        const elapsedTime = (Date.now() - startTime) / 1000; // in seconds
                        const speed = totalSize / elapsedTime; // bytes per second
                        if (progress % 20 === 0) { // Show at 20% intervals
                            message.info(`Receiving "${data.fileName}": ${progress}% complete at ${(speed / 1024).toFixed(2)} KB/s`);
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
                            message.success(`File "${data.fileName}" downloaded successfully`);
                        } else {
                            message.error(`Error downloading file "${data.fileName}"`);
                        }
                    });
            }
        })
        
        dispatch(addConnectionList(id))
        dispatch(setLoading(false))
    } catch (err) {
        dispatch(setLoading(false))
        console.log(err)
    }
})


