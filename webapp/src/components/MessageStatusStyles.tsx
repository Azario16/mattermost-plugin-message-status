import React, {useEffect} from 'react';

import '../styles/message_status.scss';

const MessageStatusStyles: React.FC = () => {
    useEffect(() => {
        document.body.classList.add('message-status-plugin-active');
        return () => {
            document.body.classList.remove('message-status-plugin-active');
        };
    }, []);

    return null;
};

export default MessageStatusStyles;
