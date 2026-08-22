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
const PORTAL_RETRY_MS = [250, 1000, 3000, 5000];

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
        const previousHost = portalHosts.get(postId);
        const wasConnected = previousHost?.isConnected ?? false;
        const host = getOrCreatePortalHost(postId);
        const isConnected = host?.isConnected ?? false;

        if (isConnected && (!wasConnected || host !== previousHost)) {
            changed = true;
        }
    });

    return changed;
}

function hasMissingPortalHosts(postIds: string[]): boolean {
    return postIds.some((postId) => {
        const anchor = getPostTickAnchor(postId);
        if (!anchor) {
            return false;
        }

        const host = portalHosts.get(postId);
        return !host?.isConnected || !anchor.contains(host);
    });
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

        const retryTimers = PORTAL_RETRY_MS.map((delay) => window.setTimeout(refresh, delay));

        const resync = () => {
            if (hasMissingPortalHosts(ownPostIds)) {
                refresh();
            }
        };

        window.addEventListener('scroll', resync, true);
        window.addEventListener('resize', resync);

        return () => {
            retryTimers.forEach((timerId) => window.clearTimeout(timerId));
            window.removeEventListener('scroll', resync, true);
            window.removeEventListener('resize', resync);
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
