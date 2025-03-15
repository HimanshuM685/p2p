import React, { useState } from 'react';
import { Button, Card, Col, Input, Menu, MenuProps, message, Row, Space, Typography, Upload, UploadFile, Progress } from "antd";
import { CopyOutlined, UploadOutlined } from "@ant-design/icons";
import { useAppDispatch, useAppSelector } from "./store/hooks";
import { startPeer, stopPeerSession } from "./store/peer/peerActions";
import * as connectionAction from "./store/connection/connectionActions";
import { DataType, PeerConnection } from "./helpers/peer";
import { useAsyncState } from "./helpers/hooks";
import { EncryptionManager } from "./helpers/encryption";  // <-- import encryption

const { Title } = Typography;
type MenuItem = Required<MenuProps>['items'][number];

function getItem(
    label: React.ReactNode,
    key: React.Key,
    icon?: React.ReactNode,
    children?: MenuItem[],
    type?: 'group',
): MenuItem {
    return {
        key,
        icon,
        children,
        label,
        type,
    } as MenuItem;
}

export const App: React.FC = () => {
    const peer = useAppSelector((state) => state.peer);
    const connection = useAppSelector((state) => state.connection);
    const dispatch = useAppDispatch();

    const [fileList, setFileList] = useAsyncState([] as UploadFile[]);
    const [sendLoading, setSendLoading] = useAsyncState(false);
    const [progress, setProgress] = useState(0);
    const [speed, setSpeed] = useState(0);
    const [startTime, setStartTime] = useState<number | null>(null);

    const handleStartSession = () => {
        dispatch(startPeer());
    };

    const handleStopSession = async () => {
        await PeerConnection.closePeerSession();
        dispatch(stopPeerSession());
    };

    const handleConnectOtherPeer = () => {
        connection.id != null ? dispatch(connectionAction.connectPeer(connection.id || "")) : message.warning("Please enter ID");
    };

    const handleUpload = async () => {
        if (fileList.length === 0) {
            message.warning("Please select file");
            return;
        }
        if (!connection.selectedId) {
            message.warning("Please select a connection");
            return;
        }
        try {
            await setSendLoading(true);
            const encryptionManager = EncryptionManager.getInstance();
            const file = fileList[0] as unknown as File;
            
            // Generate key and store for receiver
            const key = await encryptionManager.generateKey();
            encryptionManager.storeKeyForPeer(connection.selectedId, key);
            const exportedKey = await encryptionManager.exportKey(key);
            
            // First, send a key exchange message
            await PeerConnection.sendConnection(connection.selectedId, {
                dataType: DataType.KEY_EXCHANGE,
                encryptionKey: exportedKey,
                fileName: file.name
            }, () => {});  // No progress callback for key exchange
            
            // Encrypt file
            const fileBuffer = await file.arrayBuffer();
            const { encrypted, iv } = await encryptionManager.encryptData(fileBuffer, key);
            const encryptedBlob = new Blob([encrypted], { type: file.type });
            
            // Set start time for speed calculation
            setStartTime(Date.now());

            // Send encrypted file
            await PeerConnection.sendConnection(connection.selectedId, {
                dataType: DataType.FILE,
                file: encryptedBlob,
                fileName: file.name,
                fileType: file.type,
                iv: iv,
                encrypted: true
            }, (p) => {
                setProgress(p);
                const elapsedTime = (Date.now() - (startTime || Date.now())) / 1000; // in seconds
                const speed = (file.size * (p / 100)) / elapsedTime; // bytes per second
                setSpeed(speed);
            });
            
            await setSendLoading(false);
            message.info("Send file successfully");
        } catch (err) {
            await setSendLoading(false);
            console.log(err);
            message.error("Error when sending file");
        }
    };

    return (
        <Row justify={"center"} align={"top"}>
            <Col xs={24} sm={24} md={20} lg={16} xl={12}>
                <Card>
                    <Title level={2} style={{ textAlign: "center" }}>P2P File Transfer</Title>
                    <Card hidden={peer.started}>
                        <Button onClick={handleStartSession} loading={peer.loading}>Start</Button>
                    </Card>
                    <Card hidden={!peer.started}>
                        <Space direction="horizontal">
                            <div>ID: {peer.id}</div>
                            <Button icon={<CopyOutlined />} onClick={async () => {
                                await navigator.clipboard.writeText(peer.id || "");
                                message.info("Copied: " + peer.id);
                            }} />
                            <Button danger onClick={handleStopSession}>Stop</Button>
                        </Space>
                    </Card>
                    <div hidden={!peer.started}>
                        <Card>
                            <Space direction="horizontal">
                                <Input placeholder={"ID"}
                                    onChange={e => dispatch(connectionAction.changeConnectionInput(e.target.value))}
                                    required={true}
                                />
                                <Button onClick={handleConnectOtherPeer}
                                    loading={connection.loading}>Connect</Button>
                            </Space>
                        </Card>

                        <Card title="Connection">
                            {
                                connection.list.length === 0
                                    ? <div>Waiting for connection ...</div>
                                    : <div>
                                        Select a connection
                                        <Menu selectedKeys={connection.selectedId ? [connection.selectedId] : []}
                                            onSelect={(item) => dispatch(connectionAction.selectItem(item.key))}
                                            items={connection.list.map(e => getItem(e, e, null))} />
                                    </div>
                            }

                        </Card>
                        <Card title="Send File">
                            <Upload fileList={fileList}
                                maxCount={1}
                                onRemove={() => setFileList([])}
                                beforeUpload={(file) => {
                                    setFileList([file]);
                                    return false;
                                }}>
                                <Button icon={<UploadOutlined />}>Select File</Button>
                            </Upload>
                            <Button
                                type="primary"
                                onClick={handleUpload}
                                disabled={fileList.length === 0}
                                loading={sendLoading}
                                style={{ marginTop: 16 }}
                            >
                                {sendLoading ? 'Sending' : 'Send'}
                            </Button>
                            {sendLoading && (
                                <>
                                    <Progress percent={progress} />
                                    <div>Speed: {(speed / 1024).toFixed(2)} KB/s</div>
                                </>
                            )}
                        </Card>
                    </div>
                </Card>
            </Col>
        </Row>
    );
};

export default App;
