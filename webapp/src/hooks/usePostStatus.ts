import {useEffect, useState} from 'react';
import type {Store} from 'redux';

import type {GlobalState} from '@mattermost/types/store';

import {getPostStatus} from '../actions/status';
import type {StatusEntry} from '../types/store';

export function usePostStatus(store: Store<GlobalState>, postId?: string): StatusEntry | undefined {
    const [statusEntry, setStatusEntry] = useState<StatusEntry | undefined>(() =>
        (postId ? getPostStatus(store.getState(), postId) : undefined),
    );

    useEffect(() => {
        if (!postId) {
            setStatusEntry(undefined);
            return undefined;
        }

        const update = () => {
            setStatusEntry(getPostStatus(store.getState(), postId));
        };

        update();
        return store.subscribe(update);
    }, [store, postId]);

    return statusEntry;
}
