import type {PluginState, StatusEntry} from '../types/store';
import {SET_STATUS, SET_STATUSES} from '../types/store';

const initialState: PluginState = {
    statuses: {},
};

type SetStatusAction = {
    type: typeof SET_STATUS;
    data: StatusEntry & {postId: string};
};

type SetStatusesAction = {
    type: typeof SET_STATUSES;
    data: Record<string, StatusEntry>;
};

type PluginAction = SetStatusAction | SetStatusesAction;

export default function reducer(state: PluginState = initialState, action: PluginAction): PluginState {
    switch (action.type) {
    case SET_STATUS: {
        const {postId, ...entry} = action.data;
        return {
            ...state,
            statuses: {
                ...state.statuses,
                [postId]: entry,
            },
        };
    }
    case SET_STATUSES:
        return {
            ...state,
            statuses: {
                ...state.statuses,
                ...action.data,
            },
        };
    default:
        return state;
    }
}
