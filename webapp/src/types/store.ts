export type MessageStatusValue = 'delivered' | 'read';

export type StatusEntry = {
    status: MessageStatusValue;
    readBy: string[];
};

export type PluginState = {
    statuses: Record<string, StatusEntry>;
};

export const PLUGIN_STATE_KEY = 'plugins-com.github.mattermost-message-status';

export const SET_STATUS = pluginAction('SET_STATUS');
export const SET_STATUSES = pluginAction('SET_STATUSES');

function pluginAction(name: string): string {
    return `PLUGIN_${PLUGIN_STATE_KEY}_${name}`;
}

export type StatusUpdatePayload = {
    post_id: string;
    channel_id: string;
    author_id: string;
    status: MessageStatusValue;
    read_by: string[];
};

export type StatusResponse = {
    post_id: string;
    status: MessageStatusValue;
    read_by: string[];
};
