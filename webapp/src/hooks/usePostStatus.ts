import {useSyncExternalStore} from 'react';
import type {Store} from 'redux';

import type {GlobalState} from '@mattermost/types/store';

import {getPostStatus} from '../actions/status';
import type {StatusEntry} from '../types/store';

export function usePostStatus(store: Store<GlobalState>, postId?: string): StatusEntry | undefined {
    return useSyncExternalStore(
        store.subscribe,
        () => (postId ? getPostStatus(store.getState(), postId) : undefined),
        () => undefined,
    );
}
