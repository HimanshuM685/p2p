import {ConnectionAction, ConnectionActionType, ConnectionState} from "./connectionTypes";

const initialState: ConnectionState = {
    id: null,
    loading: false,
    list: [],
    selectedId: null,
    receiveProgress: 0,
    showReceiveProgress: false
};

export default (state = initialState, action: ConnectionAction): ConnectionState => {
    switch (action.type) {
        case ConnectionActionType.CONNECTION_INPUT_CHANGE:
            return {
                ...state,
                id: action.id || null
            }
        case ConnectionActionType.CONNECTION_LOADING:
            return {
                ...state,
                loading: true
            }
        case ConnectionActionType.CONNECTION_LIST_ADD:
            return {
                ...state,
                loading: false,
                list: [...state.list, action.id || ""]
            }
        case ConnectionActionType.CONNECTION_LIST_REMOVE:
            return {
                ...state,
                list: state.list.filter(e => e !== action.id),
                selectedId: state.selectedId === action.id ? null : state.selectedId
            }
        case ConnectionActionType.CONNECTION_ITEM_SELECT:
            return {
                ...state,
                selectedId: action.id || null
            }
        case ConnectionActionType.RECEIVE_PROGRESS_UPDATE:
            return {
                ...state,
                receiveProgress: action.payload?.progress || 0,
                showReceiveProgress: action.payload?.show || false
            }
        default:
            return state
    }
}