import React from 'react';
import type {Store} from 'redux';

import type {GlobalState} from '@mattermost/types/store';
import type {Post} from '@mattermost/types/posts';

import manifest from './manifest';
import reducer from './reducers';
import MessageStatusAttachment from './components/MessageStatusAttachment';
import MessageStatusStyles from './components/MessageStatusStyles';
import PostReadTracker from './components/PostReadTracker';
import {applyStatusUpdate, hydratePostStatuses, setOptimisticDelivered} from './actions/status';
import {STATUS_UPDATED_EVENT} from './constants';
import {getTranslationsForLocale} from './i18n';
import type {StatusUpdatePayload} from './types/store';
import {getOwnEligiblePostIds} from './utils/posts';

type PluginRegistry = {
    registerReducer: (reducer: typeof reducer) => void;
    registerRootComponent: (component: React.ComponentType) => string;
    registerPostMessageAttachmentComponent: (component: React.ComponentType<{postId?: string; post?: Post; store?: Store<GlobalState>}>) => string;
    registerWebSocketEventHandler: (event: string, handler: (msg: {data?: StatusUpdatePayload}) => void) => void;
    registerReconnectHandler: (handler: () => void) => void;
    registerTranslations: (getTranslationsForLocale: (locale: string) => Record<string, string>) => void;
};

function extractStatusPayload(msg: unknown): unknown {
    if (!msg || typeof msg !== 'object') {
        return msg;
    }

    const envelope = msg as {data?: Record<string, unknown>};
    if (!envelope.data || typeof envelope.data !== 'object') {
        return msg;
    }

    return envelope.data;
}

export default class Plugin {
    public initialize(registry: PluginRegistry, store: Store<GlobalState>): void {
        registry.registerReducer(reducer);
        registry.registerTranslations(getTranslationsForLocale);
        registry.registerRootComponent(MessageStatusStyles);
        registry.registerRootComponent(() => <PostReadTracker store={store}/>);

        const Attachment = (props: {postId?: string; post?: Post}) => (
            <MessageStatusAttachment
                {...props}
                store={store}
            />
        );
        registry.registerPostMessageAttachmentComponent(Attachment);

        registry.registerWebSocketEventHandler(STATUS_UPDATED_EVENT, (msg) => {
            applyStatusUpdate(store, extractStatusPayload(msg));
        });

        registry.registerReconnectHandler(() => {
            const state = store.getState();
            const postIds = getOwnEligiblePostIds(state);
            if (postIds.length === 0) {
                return;
            }

            setOptimisticDelivered(store, postIds);
            void hydratePostStatuses(store, postIds);
        });
    }
}

declare global {
    interface Window {
        registerPlugin: (pluginId: string, plugin: Plugin) => void;
    }
}

window.registerPlugin(manifest.id, new Plugin());
