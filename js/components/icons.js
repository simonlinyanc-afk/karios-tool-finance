// Icons for Yellow Bird Finance
// Depends on React being loaded
// Attached to window to be accessible across Babel scripts

// Create Icon component that renders SVG directly without lucide.createIcons()
window.Icon = ({ path, size = 20, className = "", strokeWidth = 2, ...props }) => {
    return React.createElement('svg', {
        xmlns: 'http://www.w3.org/2000/svg',
        width: size,
        height: size,
        viewBox: '0 0 24 24',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: strokeWidth,
        strokeLinecap: 'round',
        strokeLinejoin: 'round',
        className: className,
        ...props
    }, React.createElement('path', { d: path }));
};

// Icon SVG paths (from Lucide)
window.Upload = (props) => React.createElement(window.Icon, { path: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12', ...props });
window.FileText = (props) => React.createElement(window.Icon, { path: 'M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2zM14 2v6h6M16 13H8M16 17H8M10 9H8', ...props });
window.Settings = (props) => React.createElement(window.Icon, { path: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z', ...props });
window.Eye = (props) => React.createElement(window.Icon, { path: 'M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7zM15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z', ...props });
window.User = (props) => React.createElement(window.Icon, { path: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0z', ...props });
window.Briefcase = (props) => React.createElement(window.Icon, { path: 'M16 20V4a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16m0-16H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2', ...props });
window.Calendar = (props) => React.createElement(window.Icon, { path: 'M8 2v4M16 2v4M3 10h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z', ...props });
window.Download = (props) => React.createElement(window.Icon, { path: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3', ...props });
window.X = (props) => React.createElement(window.Icon, { path: 'M18 6 6 18M6 6l12 12', ...props });
window.ChevronDown = (props) => React.createElement(window.Icon, { path: 'm6 9 6 6 6-6', ...props });
window.ChevronUp = (props) => React.createElement(window.Icon, { path: 'm18 15-6-6-6 6', ...props });
window.Plus = (props) => React.createElement(window.Icon, { path: 'M5 12h14M12 5v14', ...props });
window.Image = (props) => React.createElement(window.Icon, { path: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M14.5 2H6a2 2 0 0 0-2 2v12l5-5 4 4 7-7V7.5L14.5 2zM14 2v6h6M9.5 9.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0z', ...props });

window.RefreshCw = (props) => React.createElement(window.Icon, { path: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8M3 16l2.26 2.26A9.75 9.75 0 0 0 12 21a9 9 0 0 0 9-9', ...props });
window.Clock = (props) => React.createElement(window.Icon, { path: 'M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10zM12 6v6l4 2', ...props });
window.Trash2 = (props) => React.createElement(window.Icon, { path: 'M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6', ...props });
window.Check = (props) => React.createElement(window.Icon, { path: 'M20 6 9 17l-5-5', ...props });
window.Edit2 = (props) => React.createElement(window.Icon, { path: 'M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z', ...props });
window.Minus = (props) => React.createElement(window.Icon, { path: 'M5 12h14', ...props });
window.ZoomIn = (props) => React.createElement(window.Icon, { path: 'm21 21-4.3-4.3M11 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6m0-5a8 8 0 1 1-8 8 8 8 0 0 1 8 8M11 8v6M8 11h6', ...props });
window.ZoomOut = (props) => React.createElement(window.Icon, { path: 'm21 21-4.3-4.3M11 8a3 3 0 1 0 0 6 3 3 0 0 0 0-6m0-5a8 8 0 1 1-8 8 8 8 0 0 1 8 8M8 11h6', ...props });
window.Maximize = (props) => React.createElement(window.Icon, { path: 'M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3', ...props });
window.ExternalLink = (props) => React.createElement(window.Icon, { path: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14L21 3', ...props });
window.ArrowUpDown = (props) => React.createElement(window.Icon, { path: 'M7 20V4m0 0L3 8m4-4l4 4M17 4v16m0 0l-4-4m4 4l4-4', ...props });
