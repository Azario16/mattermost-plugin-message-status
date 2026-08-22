import React, {useCallback, useEffect, useMemo, useRef} from 'react';
import {useSelector} from 'react-redux';
import type {Store} from 'redux';

import type {GlobalState} from '@mattermost/types/store';
import type {Channel} from '@mattermost/types/channels';
import type {Post} from '@mattermost/types/posts';

import {hydratePostStatuses, markPostAsRead, setOptimisticDelivered} from '../actions/status';
import {READ_THRESHOLD} from '../constants';
import {
    getPostElement,
    getReadablePosts,
    getSelectedThreadRootId,
    getThreadPostIds,
    getVisiblePosts,
    isEligiblePost,
    isOwnPost,
    shouldForceReadPost,
} from '../utils/posts';
import {isElementVisible} from '../utils/visibility';

type Props = {
    store: Store<GlobalState>;
};

type ExtendedGlobalState = GlobalState & {
    views?: {
        lhs?: {
            currentStaticPageId?: string;
        };
        rhs?: {
            selectedPostId?: string;
            isSidebarOpen?: boolean;
        };
        rhsSuppressed?: boolean;
        threads?: {
            selectedThreadIdInTeam?: Record<string, string | null>;
        };
    };
};

const READ_RETRY_MS = 3000;

const observedPosts = new Set<string>();
const pendingReads = new Set<string>();
const retryTimers = new Map<string, number>();

function clearRetryTimer(postId: string): void {
    const timerId = retryTimers.get(postId);
    if (timerId !== undefined) {
        window.clearTimeout(timerId);
        retryTimers.delete(postId);
    }
}

const PostReadTracker: React.FC<Props> = ({store}) => {
    const currentUserId = useSelector((state: GlobalState) => state.entities.users.currentUserId);
    const currentChannelId = useSelector((state: GlobalState) => state.entities.channels.currentChannelId);
    const currentStaticPageId = useSelector((state: ExtendedGlobalState) => state.views?.lhs?.currentStaticPageId || '');
    const selectedThreadRootId = useSelector((state: ExtendedGlobalState) => getSelectedThreadRootId(state));
    const currentChannel = useSelector((state: GlobalState) => {
        if (!currentChannelId) {
            return undefined;
        }

        return state.entities.channels.channels[currentChannelId];
    });
    const visiblePosts = useSelector((state: ExtendedGlobalState) => getVisiblePosts(state));
    const readableCandidatePosts = useSelector((state: ExtendedGlobalState) => getReadablePosts(state));

    const observerRef = useRef<IntersectionObserver | null>(null);
    const tryMarkPostReadRef = useRef<(postId: string, channel?: Channel) => void>(() => undefined);
    const hydratedScopeRef = useRef('');

    const scopeKey = `${currentStaticPageId}:${currentChannelId || ''}:${selectedThreadRootId || ''}`;

    const ownPostIds = useMemo(() => {
        if (!currentUserId) {
            return [] as string[];
        }

        return visiblePosts
            .filter((post) => isEligiblePost(post) && isOwnPost(post, currentUserId))
            .map((post) => post.id);
    }, [currentUserId, visiblePosts]);

    const readablePosts = useMemo(() => {
        if (!currentUserId) {
            return [] as Post[];
        }

        return readableCandidatePosts.filter((post) => isEligiblePost(post) && !isOwnPost(post, currentUserId));
    }, [currentUserId, readableCandidatePosts]);

    const scheduleReadRetry = useCallback((postId: string, channel?: Channel) => {
        if (retryTimers.has(postId)) {
            return;
        }

        const timerId = window.setTimeout(() => {
            retryTimers.delete(postId);
            pendingReads.delete(postId);
            tryMarkPostReadRef.current(postId, channel);
        }, READ_RETRY_MS);

        retryTimers.set(postId, timerId);
    }, []);

    const tryMarkPostRead = useCallback((postId: string, channel?: Channel) => {
        if (!currentUserId || !postId || observedPosts.has(postId) || pendingReads.has(postId)) {
            return;
        }

        const post = store.getState().entities.posts.posts[postId];
        if (!isEligiblePost(post) || isOwnPost(post, currentUserId)) {
            return;
        }

        const postChannel = channel || store.getState().entities.channels.channels[post.channel_id];
        const state = store.getState() as ExtendedGlobalState;
        const openThreadRootId = getSelectedThreadRootId(state);
        const forceRead = shouldForceReadPost(post, postChannel, openThreadRootId);
        const requiresVisibility = !forceRead;

        if (requiresVisibility) {
            const element = getPostElement(postId) ||
                (post.root_id ? getPostElement(post.root_id) : null);
            if (!element || !isElementVisible(element, READ_THRESHOLD)) {
                return;
            }
        }

        pendingReads.add(postId);
        clearRetryTimer(postId);

        void markPostAsRead(postId).then((result) => {
            if (result?.post_id) {
                observedPosts.add(postId);
                return;
            }

            scheduleReadRetry(postId, postChannel);
        }).finally(() => {
            pendingReads.delete(postId);
        });
    }, [currentUserId, scheduleReadRetry, store]);

    tryMarkPostReadRef.current = tryMarkPostRead;

    useEffect(() => {
        observedPosts.clear();
        pendingReads.clear();
        retryTimers.forEach((timerId) => window.clearTimeout(timerId));
        retryTimers.clear();
        hydratedScopeRef.current = '';
    }, [scopeKey]);

    useEffect(() => {
        if (ownPostIds.length === 0) {
            return;
        }

        setOptimisticDelivered(store, ownPostIds);

        if (hydratedScopeRef.current !== scopeKey) {
            hydratedScopeRef.current = scopeKey;
            void hydratePostStatuses(store, ownPostIds);
        }
    }, [ownPostIds.join(','), scopeKey, store]);

    useEffect(() => {
        if (!currentUserId || !selectedThreadRootId) {
            return undefined;
        }

        const markOpenThreadPosts = () => {
            const state = store.getState() as ExtendedGlobalState;
            getThreadPostIds(state, selectedThreadRootId).forEach((postId) => {
                const post = state.entities.posts.posts[postId];
                if (!isEligiblePost(post) || isOwnPost(post, currentUserId)) {
                    return;
                }

                const postChannel = state.entities.channels.channels[post.channel_id];
                tryMarkPostRead(postId, postChannel);
            });
        };

        markOpenThreadPosts();
        const retryTimer = window.setTimeout(markOpenThreadPosts, 500);
        const retryTimer2 = window.setTimeout(markOpenThreadPosts, 2000);

        return () => {
            window.clearTimeout(retryTimer);
            window.clearTimeout(retryTimer2);
        };
    }, [currentUserId, selectedThreadRootId, store, tryMarkPostRead]);

    useEffect(() => {
        if (ownPostIds.length === 0) {
            return undefined;
        }

        const refreshOwnStatuses = () => {
            void hydratePostStatuses(store, ownPostIds);
        };

        window.addEventListener('focus', refreshOwnStatuses);
        return () => {
            window.removeEventListener('focus', refreshOwnStatuses);
        };
    }, [ownPostIds.join(','), store]);

    useEffect(() => {
        if (!currentUserId) {
            return;
        }

        readablePosts.forEach((post) => {
            const postChannel = store.getState().entities.channels.channels[post.channel_id];
            if (shouldForceReadPost(post, postChannel, selectedThreadRootId)) {
                tryMarkPostRead(post.id, postChannel);
            }
        });

        observerRef.current?.disconnect();

        observerRef.current = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting || entry.intersectionRatio < READ_THRESHOLD) {
                    return;
                }

                const postId = (entry.target as HTMLElement).id?.replace(/^(post|rhsPost)_/, '') ||
                    (entry.target as HTMLElement).dataset.postid ||
                    (entry.target as HTMLElement).dataset.postId;
                if (postId) {
                    const post = store.getState().entities.posts.posts[postId];
                    const postChannel = post ? store.getState().entities.channels.channels[post.channel_id] : undefined;
                    tryMarkPostRead(postId, postChannel);
                }
            });
        }, {
            threshold: [READ_THRESHOLD],
        });

        const observePosts = () => {
            readablePosts.forEach((post) => {
                const postChannel = store.getState().entities.channels.channels[post.channel_id];
                if (shouldForceReadPost(post, postChannel, selectedThreadRootId)) {
                    tryMarkPostRead(post.id, postChannel);
                    return;
                }

                const element = getPostElement(post.id);
                if (!element || observedPosts.has(post.id)) {
                    return;
                }

                observerRef.current?.observe(element);
                tryMarkPostRead(post.id, postChannel);
            });
        };

        observePosts();
        const retryTimer = window.setTimeout(observePosts, 250);
        const retryTimer2 = window.setTimeout(observePosts, 1000);
        const retryTimer3 = window.setTimeout(observePosts, 3000);

        return () => {
            window.clearTimeout(retryTimer);
            window.clearTimeout(retryTimer2);
            window.clearTimeout(retryTimer3);
            observerRef.current?.disconnect();
        };
    }, [currentUserId, readablePosts, selectedThreadRootId, store, tryMarkPostRead]);

    return null;
};

export default PostReadTracker;
