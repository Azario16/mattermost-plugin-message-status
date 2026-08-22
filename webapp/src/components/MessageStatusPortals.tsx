import React, {useEffect, useReducer} from 'react';
import {createPortal} from 'react-dom';
import {useSelector} from 'react-redux';
import type {Store} from 'redux';

import type {GlobalState} from '@mattermost/types/store';

import MessageStatusAttachment from './MessageStatusAttachment';
import {getOwnEligiblePostIds, getPostTickAnchor} from '../utils/posts';

type Props = {
    store: Store<GlobalState>;
};

const portalHosts = new Map<string, HTMLElement>();

function getOrCreatePortalHost(postId: string): HTMLElement | null {
    const anchor = getPostTickAnchor(postId);
    if (!anchor) {
        return null;
    }

    const cached = portalHosts.get(postId);
    if (cached?.isConnected && anchor.contains(cached)) {
        return cached;
    }

    if (cached) {
        portalHosts.delete(postId);
    }

    const host = document.createElement('div');
    host.className = 'message-status-ticks-portal-host';
    host.dataset.postId = postId;
    anchor.appendChild(host);
    portalHosts.set(postId, host);
    return host;
}

function syncPortalHosts(postIds: string[]): boolean {
    let changed = false;

    postIds.forEach((postId) => {
        const wasConnected = portalHosts.get(postId)?.isConnected ?? false;
        getOrCreatePortalHost(postId);
        const isConnected = portalHosts.get(postId)?.isConnected ?? false;
        if (isConnected && !wasConnected) {
            changed = true;
        }
    });

    return changed;
}

const MessageStatusPortals: React.FC<Props> = ({store}) => {
    const ownPostIds = useSelector(getOwnEligiblePostIds);
    const ownPostIdsKey = ownPostIds.join(',');
    const [, bumpRender] = useReducer((value: number) => value + 1, 0);

    useEffect(() => {
        const refresh = () => {
            if (syncPortalHosts(ownPostIds)) {
                bumpRender();
            }
        };

        refresh();

        const retryTimer = window.setTimeout(refresh, 250);
        const retryTimer2 = window.setTimeout(refresh, 1000);

        return () => {
            window.clearTimeout(retryTimer);
            window.clearTimeout(retryTimer2);
        };
    }, [ownPostIdsKey]);

    return (
        <>
            {ownPostIds.map((postId) => {
                const host = portalHosts.get(postId);
                if (!host?.isConnected) {
                    return null;
                }

                return createPortal(
                    <MessageStatusAttachment
                        key={postId}
                        postId={postId}
                        store={store}
                    />,
                    host,
                );
            })}
        </>
    );
};

export default MessageStatusPortals;
