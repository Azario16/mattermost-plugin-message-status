import React from 'react';
import {useSelector} from 'react-redux';
import type {Store} from 'redux';

import type {GlobalState} from '@mattermost/types/store';
import type {Post} from '@mattermost/types/posts';

import {formatReadByLabel, getTranslationsForLocale} from '../i18n';
import {usePostStatus} from '../hooks/usePostStatus';
import {getOtherUserIdInDM, getUserDisplayName, isDirectChannel, isEligiblePost, isOwnPost} from '../utils/posts';
import MessageStatusTicks from './MessageStatusTicks';

type Props = {
    postId?: string;
    post?: Post;
    store: Store<GlobalState>;
};

function resolvePost(state: GlobalState, postProp?: Post, postId?: string): Post | undefined {
    if (postProp) {
        return postProp;
    }

    if (!postId) {
        return undefined;
    }

    return state.entities.posts.posts[postId];
}

const MessageStatusAttachment: React.FC<Props> = ({postId, post: postProp, store}) => {
    const currentUserId = useSelector((state: GlobalState) => state.entities.users.currentUserId);
    const locale = useSelector((state: GlobalState) => state.entities.i18n?.locale || 'en');
    const post = useSelector((state: GlobalState) => resolvePost(state, postProp, postId));
    const channel = useSelector((state: GlobalState) => {
        const channelId = post?.channel_id;
        return channelId ? state.entities.channels.channels[channelId] : undefined;
    });
    const state = useSelector((value: GlobalState) => value);
    const statusEntry = usePostStatus(store, post?.id);

    if (!post || !currentUserId || !isEligiblePost(post) || !isOwnPost(post, currentUserId)) {
        return null;
    }

    const status = statusEntry?.status || 'delivered';

    const translations = getTranslationsForLocale(locale);
    const deliveredLabel = translations['plugin.message_status.delivered'];
    const readLabel = translations['plugin.message_status.read'];
    const readByTemplate = translations['plugin.message_status.read_by'];

    let tooltip = deliveredLabel;
    if (status === 'read') {
        const readerIds = (statusEntry?.readBy || []).filter((userId) => userId !== currentUserId);
        if (readerIds.length > 0) {
            const names = readerIds.map((userId) => getUserDisplayName(state, userId));
            tooltip = formatReadByLabel(readByTemplate, names.join(', '));
        } else if (isDirectChannel(channel)) {
            const otherUserId = getOtherUserIdInDM(channel, currentUserId);
            tooltip = otherUserId ?
                formatReadByLabel(readByTemplate, getUserDisplayName(state, otherUserId)) :
                readLabel;
        } else {
            tooltip = readLabel;
        }
    }

    return (
        <div
            className='message-status-ticks-attachment'
            data-message-status={status}
        >
            <MessageStatusTicks
                status={status}
                label={status === 'read' ? readLabel : deliveredLabel}
                title={tooltip}
            />
        </div>
    );
};

export default MessageStatusAttachment;
