    // --- SVG ICONS ---

    function IconTarget({ size = 15, className = '' }) {

      return React.createElement(

        'svg',

        {

          width: size,

          height: size,

          viewBox: '0 0 24 24',

          fill: 'none',

          stroke: 'currentColor',

          strokeWidth: 2,

          strokeLinecap: 'round',

          strokeLinejoin: 'round',

          className,

        },

        React.createElement('circle', { cx: 12, cy: 12, r: 10 }),

        React.createElement('circle', { cx: 12, cy: 12, r: 6 }),

        React.createElement('circle', { cx: 12, cy: 12, r: 2 }),

      );

    }

    function IconTrash({ size = 14, className = '' }) {

      return React.createElement(

        'svg',

        {

          width: size,

          height: size,

          viewBox: '0 0 24 24',

          fill: 'none',

          stroke: 'currentColor',

          strokeWidth: 1.8,

          strokeLinecap: 'round',

          strokeLinejoin: 'round',

          className,

        },

        React.createElement('path', { d: 'M3 6h18' }),

        React.createElement('path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }),

        React.createElement('path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }),

      );

    }

    function IconPause({ size = 14, className = '' }) {

      return React.createElement(

        'svg',

        {

          width: size,

          height: size,

          viewBox: '0 0 24 24',

          fill: 'none',

          stroke: 'currentColor',

          strokeWidth: 1.8,

          strokeLinecap: 'round',

          strokeLinejoin: 'round',

          className,

        },

        React.createElement('circle', { cx: 12, cy: 12, r: 10 }),

        React.createElement('line', { x1: 10, y1: 15, x2: 10, y2: 9 }),

        React.createElement('line', { x1: 14, y1: 15, x2: 14, y2: 9 }),

      );

    }

    function IconPlay({ size = 14, className = '' }) {

      return React.createElement(

        'svg',

        {

          width: size,

          height: size,

          viewBox: '0 0 24 24',

          fill: 'none',

          stroke: 'currentColor',

          strokeWidth: 1.8,

          strokeLinecap: 'round',

          strokeLinejoin: 'round',

          className,

        },

        React.createElement('circle', { cx: 12, cy: 12, r: 10 }),

        React.createElement('polygon', { points: '10 8 16 12 10 16 10 8', fill: 'currentColor' }),

      );

    }

    function IconCheck({ size = 15, className = '' }) {

      return React.createElement(

        'svg',

        {

          width: size,

          height: size,

          viewBox: '0 0 24 24',

          fill: 'none',

          stroke: 'currentColor',

          strokeWidth: 2.5,

          strokeLinecap: 'round',

          strokeLinejoin: 'round',

          className,

        },

        React.createElement('polyline', { points: '20 6 9 17 4 12' }),

      );

    }

    function IconExpand({ size = 14, className = '' }) {

      return React.createElement(

        'svg',

        {

          width: size,

          height: size,

          viewBox: '0 0 24 24',

          fill: 'none',

          stroke: 'currentColor',

          strokeWidth: 1.8,

          strokeLinecap: 'round',

          strokeLinejoin: 'round',

          className,

        },

        React.createElement('polyline', { points: '15 3 21 3 21 9' }),

        React.createElement('polyline', { points: '9 21 3 21 3 15' }),

        React.createElement('line', { x1: 21, y1: 3, x2: 14, y2: 10 }),

        React.createElement('line', { x1: 3, y1: 21, x2: 10, y2: 14 }),

      );

    }

    function IconMinimize({ size = 14, className = '' }) {

      return React.createElement(

        'svg',

        {

          width: size,

          height: size,

          viewBox: '0 0 24 24',

          fill: 'none',

          stroke: 'currentColor',

          strokeWidth: 1.8,

          strokeLinecap: 'round',

          strokeLinejoin: 'round',

          className,

        },

        React.createElement('polyline', { points: '4 14 10 14 10 20' }),

        React.createElement('polyline', { points: '20 10 14 10 14 4' }),

        React.createElement('line', { x1: 14, y1: 10, x2: 21, y2: 3 }),

        React.createElement('line', { x1: 3, y1: 21, x2: 10, y2: 14 }),

      );

    }

    function IconRotateCcw({ size = 13, className = '' }) {

      return React.createElement(

        'svg',

        {

          width: size,

          height: size,

          viewBox: '0 0 24 24',

          fill: 'none',

          stroke: 'currentColor',

          strokeWidth: 2,

          strokeLinecap: 'round',

          strokeLinejoin: 'round',

          className,

        },

        React.createElement('polyline', { points: '1 4 1 10 7 10' }),

        React.createElement('path', { d: 'M3.51 15a9 9 0 1 0 2.13-9.36L1 10' }),

      );

    }

    function IconChevronDown({ size = 14, className = '' }) {

      return React.createElement(

        'svg',

        {

          width: size,

          height: size,

          viewBox: '0 0 24 24',

          fill: 'none',

          stroke: 'currentColor',

          strokeWidth: 2,

          strokeLinecap: 'round',

          strokeLinejoin: 'round',

          className,

        },

        React.createElement('polyline', { points: '6 9 12 15 18 9' }),

      );

    }

