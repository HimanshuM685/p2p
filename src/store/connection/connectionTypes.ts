export enum ConnectionActionType {
    CONNECTION_INPUT_CHANGE = 'CONNECTION_INPUT_CHANGE',
    CONNECTION_LOADING = 'CONNECTION_LOADING',
    CONNECTION_LIST_ADD = 'CONNECTION_LIST_ADD',
    CONNECTION_LIST_REMOVE = 'CONNECTION_LIST_REMOVE',
    CONNECTION_ITEM_SELECT = 'CONNECTION_ITEM_SELECT',
    RECEIVE_PROGRESS_UPDATE = 'RECEIVE_PROGRESS_UPDATE'
}

export interface ConnectionState {
    id: string | null;
    loading: boolean;
    list: string[];
    selectedId: string | null;
    receiveProgress: number;
    showReceiveProgress: boolean;
}

export interface ConnectionAction {
    type: ConnectionActionType;
    id?: string;
    payload?: {
        progress: number;
        show: boolean;
    };
}