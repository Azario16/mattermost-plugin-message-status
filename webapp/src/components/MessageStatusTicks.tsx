import React from 'react';

import {TICK_SIZE} from '../constants';

type Props = {
    status: 'delivered' | 'read';
    label: string;
    title: string;
};

const MessageStatusTicks: React.FC<Props> = ({status, label, title}) => {
    const color = status === 'read' ? '#22C55E' : '#9CA3AF';

    return (
        <span
            className={`message-status-ticks message-status-ticks--${status}`}
            aria-label={label}
            title={title}
        >
            <svg
                className='message-status-ticks__icon'
                width={status === 'read' ? TICK_SIZE + 4 : TICK_SIZE}
                height={TICK_SIZE}
                viewBox={status === 'read' ? '0 0 18 12' : '0 0 12 12'}
                role='img'
                aria-hidden='true'
            >
                {status === 'read' ? (
                    <>
                        <path
                            d='M1.5 6.2L3.8 8.5L7.2 3.5'
                            fill='none'
                            stroke={color}
                            strokeWidth='1.6'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                        />
                        <path
                            d='M6.5 6.2L8.8 8.5L16 1.5'
                            fill='none'
                            stroke={color}
                            strokeWidth='1.6'
                            strokeLinecap='round'
                            strokeLinejoin='round'
                        />
                    </>
                ) : (
                    <path
                        d='M1.5 6.2L4.2 9L10.5 2.5'
                        fill='none'
                        stroke={color}
                        strokeWidth='1.6'
                        strokeLinecap='round'
                        strokeLinejoin='round'
                    />
                )}
            </svg>
        </span>
    );
};

export default MessageStatusTicks;
