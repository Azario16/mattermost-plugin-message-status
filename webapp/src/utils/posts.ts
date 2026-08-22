import type {Post} from '@mattermost/types/posts';
import type {Channel} from '@mattermost/types/channels';
import type {GlobalState} from '@mattermost/types/store';

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

const GLOBAL_THREADS_PAGE_ID = 'threads';

export function isGlobalThreadsViewActive(state: ExtendedGlobalState): boolean {
    return state.views?.lhs?.currentStaticPageId === GLOBAL_THREADS_PAGE_ID;
}

export function getRhsThreadRootId(state: ExtendedGlobalState): string | undefined {
    if (!state.views?.rhs?.isSidebarOpen || state.views?.rhsSuppressed) {
        return undefined;
    }

    return state.views.rhs.selectedPostId || undefined;
}

export function getGlobalThreadsRootId(state: ExtendedGlobalState): string | undefined {
    const currentTeamId = state.entities.teams.currentTeamId;
    if (!currentTeamId) {
        return undefined;
    }

    const rootId = state.views?.threads?.selectedThreadIdInTeam?.[currentTeamId];
    return rootId || undefined;
}

export function getSelectedThreadRootId(state: ExtendedGlobalState): string | undefined {
    if (isGlobalThreadsViewActive(state)) {
        return getGlobalThreadsRootId(state);
    }

    return getRhsThreadRootId(state);
}

function addThreadPosts(state: ExtendedGlobalState, postIds: Set<string>, rootId: string): void {
    postIds.add(rootId);
    getPostIdsInThread(state, rootId).forEach((replyId) => {
        postIds.add(replyId);
    });
}

export function isPendingPost(post: Post): boolean {
    return Boolean(post.pending_post_id && post.id === post.pending_post_id);
}

// Mattermost plugins (e.g. Channel Reply) use custom_* post types for user-authored content.
export function isUserContentPostType(type?: string): boolean {
    if (!type) {
        return true;
    }

    if (type.startsWith('system_')) {
        return false;
    }

    if (type.startsWith('custom_')) {
        return true;
    }

    return false;
}

export function isCustomPluginPost(post: {type?: string}): boolean {
    return Boolean(post.type?.startsWith('custom_')) && isUserContentPostType(post.type);
}

export function isEligiblePost(post: Post | undefined): post is Post {
    if (!post) {
        return false;
    }

    if (post.delete_at > 0) {
        return false;
    }

    if (!isUserContentPostType(post.type)) {
        return false;
    }

    if (post.props?.from_webhook) {
        return false;
    }

    if (post.props?.from_bot === 'true' || post.props?.from_bot === true) {
        return false;
    }

    if (isPendingPost(post)) {
        return false;
    }

    return true;
}

export function isOwnPost(post: Post, currentUserId: string): boolean {
    return post.user_id === currentUserId;
}

export function isDirectChannel(channel: Channel | undefined): boolean {
    return channel?.type === 'D';
}

export function getOtherUserIdInDM(channel: Channel | undefined, currentUserId: string): string | undefined {
    if (!channel || channel.type !== 'D') {
        return undefined;
    }

    const userIds = channel.name.split('__');
    return userIds.find((id) => id !== currentUserId);
}

export function getUserDisplayName(state: {entities: {users: {profiles: Record<string, {username?: string; first_name?: string; last_name?: string; nickname?: string}>}}}, userId: string): string {
    const user = state.entities.users.profiles[userId];
    if (!user) {
        return userId;
    }

    if (user.nickname) {
        return user.nickname;
    }

    const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim();
    if (fullName) {
        return fullName;
    }

    return user.username || userId;
}

export function getPostElement(postId: string): HTMLElement | null {
    return document.getElementById(`post_${postId}`) ||
        document.getElementById(`rhsPost_${postId}`) ||
        document.querySelector(`[data-postid="${postId}"]`) ||
        document.querySelector(`[data-post-id="${postId}"]`);
}

export function getPostTickAnchor(postId: string): HTMLElement | null {
    const postElement = getPostElement(postId);
    if (!postElement) {
        return null;
    }

    return postElement.querySelector('.post__body') ||
        postElement.querySelector('.post__content');
}

export function getPostIdsInThread(state: {entities: {posts: {postsInThread: Record<string, string[]>}}}, rootId: string): string[] {
    return state.entities.posts.postsInThread[rootId] || [];
}

export function getVisiblePostIds(state: ExtendedGlobalState): string[] {
    const postIds = new Set<string>();
    const activeThreadRootId = getSelectedThreadRootId(state);

    if (activeThreadRootId && isGlobalThreadsViewActive(state)) {
        addThreadPosts(state, postIds, activeThreadRootId);
        return Array.from(postIds);
    }

    const {currentChannelId} = state.entities.channels;

    if (currentChannelId) {
        getPostIdsInChannel(state, currentChannelId).forEach((postId) => {
            postIds.add(postId);

            getPostIdsInThread(state, postId).forEach((replyId) => {
                postIds.add(replyId);
            });
        });
    }

    if (activeThreadRootId) {
        addThreadPosts(state, postIds, activeThreadRootId);
    }

    return Array.from(postIds);
}

export function getVisiblePosts(state: ExtendedGlobalState): Post[] {
    return getVisiblePostIds(state)
        .map((postId) => state.entities.posts.posts[postId])
        .filter(Boolean) as Post[];
}

export function isThreadReply(post: Post): boolean {
    return Boolean(post.root_id);
}

export function isPostInOpenThread(post: Post, rootId?: string): boolean {
    if (!rootId) {
        return false;
    }

    return post.id === rootId || post.root_id === rootId;
}

export function shouldForceReadPost(post: Post, channel: Channel | undefined, openThreadRootId?: string): boolean {
    if (isThreadReply(post)) {
        return isPostInOpenThread(post, openThreadRootId);
    }

    if (isDirectChannel(channel)) {
        return true;
    }

    return false;
}

export function getReadablePostIds(state: ExtendedGlobalState): string[] {
    const postIds = new Set<string>();
    const activeThreadRootId = getSelectedThreadRootId(state);

    if (activeThreadRootId && isGlobalThreadsViewActive(state)) {
        addThreadPosts(state, postIds, activeThreadRootId);
        return Array.from(postIds);
    }

    const {currentChannelId} = state.entities.channels;

    if (currentChannelId) {
        getPostIdsInChannel(state, currentChannelId).forEach((postId) => {
            postIds.add(postId);
        });
    }

    if (activeThreadRootId) {
        addThreadPosts(state, postIds, activeThreadRootId);
    }

    return Array.from(postIds);
}

export function getReadablePosts(state: ExtendedGlobalState): Post[] {
    return getReadablePostIds(state)
        .map((postId) => state.entities.posts.posts[postId])
        .filter(Boolean) as Post[];
}

export function getPostIdsInChannel(state: {entities: {posts: {postsInChannel: Record<string, Array<{order: string[]}>>}}}, channelId: string): string[] {
    const blocks = state.entities.posts.postsInChannel[channelId];
    if (!blocks?.length) {
        return [];
    }

    const postIds: string[] = [];
    blocks.forEach((block) => {
        if (block?.order?.length) {
            postIds.push(...block.order);
        }
    });

    return postIds;
}

export function getOwnEligiblePostIds(state: ExtendedGlobalState): string[] {
    const {currentUserId} = state.entities.users;
    if (!currentUserId) {
        return [];
    }

    return getVisiblePosts(state)
        .filter((post) => isEligiblePost(post) && isOwnPost(post, currentUserId))
        .map((post) => post.id);
}

export function getPostMessageElement(postId: string): HTMLElement | null {
    const postElement = getPostElement(postId);
    if (!postElement) {
        return null;
    }

    return postElement.querySelector('.post-message__text') ||
        postElement.querySelector('.post-message__text-container') ||
        postElement.querySelector('.post__body');
}
