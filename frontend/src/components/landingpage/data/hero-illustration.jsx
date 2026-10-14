export const HeroIllustration = () => (
  <svg viewBox="0 0 500 400" className="w-full h-auto" fill="none" xmlns="http://www.w3.org/2000/svg">
    {/* Background with subtle pattern */}
    <rect width="500" height="400" fill="url(#bgGradient)" rx="24" />

    {/* Grid pattern overlay */}
    <defs>
      <pattern id="grid" width="25" height="25" patternUnits="userSpaceOnUse">
        <path d="M 25 0 L 0 0 0 25" fill="none" stroke="url(#gridGradient)" strokeWidth="0.5" opacity="0.2" />
      </pattern>
    </defs>
    <rect width="500" height="400" fill="url(#grid)" />

    {/* Main School Building */}
    <rect
      x="180"
      y="120"
      width="140"
      height="100"
      fill="white"
      rx="12"
      stroke="url(#buildingGradient)"
      strokeWidth="2"
    />
    <rect x="190" y="130" width="120" height="15" fill="url(#headerGradient)" rx="4" />

    {/* Building Windows */}
    <rect x="195" y="155" width="25" height="20" fill="url(#windowGradient)" rx="3" />
    <rect x="230" y="155" width="25" height="20" fill="url(#windowGradient)" rx="3" />
    <rect x="265" y="155" width="25" height="20" fill="url(#windowGradient)" rx="3" />
    <rect x="195" y="185" width="25" height="20" fill="url(#windowGradient)" rx="3" />
    <rect x="230" y="185" width="25" height="20" fill="url(#windowGradient)" rx="3" />
    <rect x="265" y="185" width="25" height="20" fill="url(#windowGradient)" rx="3" />

    {/* School Entrance */}
    <rect x="235" y="195" width="30" height="25" fill="url(#doorGradient)" rx="4" />
    <circle cx="260" cy="207" r="2" fill="white" />

    {/* Digital Dashboard Screens */}
    <rect x="50" y="80" width="100" height="70" fill="white" rx="8" stroke="url(#screenGradient)" strokeWidth="2" />
    <rect x="55" y="85" width="90" height="12" fill="url(#headerGradient)" rx="3" />

    {/* Dashboard Charts */}
    <rect x="60" y="105" width="35" height="25" fill="url(#chartGradient)" rx="3" />
    <rect x="100" y="105" width="35" height="25" fill="url(#chart2Gradient)" rx="3" />
    <rect x="60" y="135" width="75" height="10" fill="url(#progressGradient)" rx="2" />

    {/* Mobile Devices */}
    {/* Teacher's Tablet */}
    <rect x="350" y="100" width="60" height="45" fill="white" rx="8" stroke="url(#deviceGradient)" strokeWidth="2" />
    <rect x="355" y="105" width="50" height="35" fill="url(#screenGradient)" rx="4" />
    <rect x="360" y="110" width="40" height="8" fill="url(#appGradient)" rx="2" />
    <rect x="360" y="122" width="40" height="8" fill="url(#app2Gradient)" rx="2" />

    {/* Student's Phone */}
    <rect x="420" y="180" width="35" height="60" fill="white" rx="12" stroke="url(#deviceGradient)" strokeWidth="2" />
    <rect x="425" y="190" width="25" height="40" fill="url(#screenGradient)" rx="4" />
    <circle cx="437" cy="235" r="4" fill="url(#buttonGradient)" />

    {/* Student and Teacher Icons */}
    {/* Teacher */}
    <g transform="translate(120, 250)">
      <circle r="15" fill="url(#personGradient)" />
      <rect x="-12" y="10" width="24" height="30" fill="url(#clothingGradient)" rx="4" />
      <circle cx="0" cy="-5" r="8" fill="url(#faceGradient)" />
    </g>

    {/* Students */}
    <g transform="translate(80, 280)">
      <circle r="12" fill="url(#studentGradient)" />
      <rect x="-10" y="8" width="20" height="25" fill="url(#uniformGradient)" rx="3" />
      <circle cx="0" cy="-3" r="6" fill="url(#faceGradient)" />
    </g>

    <g transform="translate(160, 280)">
      <circle r="12" fill="url(#student2Gradient)" />
      <rect x="-10" y="8" width="20" height="25" fill="url(#uniform2Gradient)" rx="3" />
      <circle cx="0" cy="-3" r="6" fill="url(#faceGradient)" />
    </g>

    {/* Data Flow Lines */}
    <path d="M 150 115 Q 180 100 180 140" stroke="url(#connectionGradient)" strokeWidth="3" fill="none" opacity="0.7">
      <animate attributeName="stroke-dasharray" values="0,100;50,50;100,0" dur="3s" repeatCount="indefinite" />
    </path>
    <path d="M 320 140 Q 350 120 350 125" stroke="url(#connectionGradient)" strokeWidth="3" fill="none" opacity="0.7">
      <animate attributeName="stroke-dasharray" values="0,100;50,50;100,0" dur="4s" repeatCount="indefinite" />
    </path>
    <path d="M 380 145 Q 420 160 420 200" stroke="url(#connectionGradient)" strokeWidth="3" fill="none" opacity="0.7">
      <animate attributeName="stroke-dasharray" values="0,100;50,50;100,0" dur="5s" repeatCount="indefinite" />
    </path>

    {/* Floating Data Particles */}
    <circle cx="100" cy="60" r="6" fill="url(#dataGradient)">
      <animate attributeName="cy" values="60;45;60" dur="4s" repeatCount="indefinite" />
      <animate attributeName="opacity" values="0.8;1;0.8" dur="4s" repeatCount="indefinite" />
    </circle>
    <circle cx="380" cy="70" r="8" fill="url(#data2Gradient)">
      <animate attributeName="cy" values="70;55;70" dur="5s" repeatCount="indefinite" />
      <animate attributeName="opacity" values="0.6;1;0.6" dur="5s" repeatCount="indefinite" />
    </circle>
    <circle cx="450" cy="120" r="5" fill="url(#data3Gradient)">
      <animate attributeName="cy" values="120;105;120" dur="6s" repeatCount="indefinite" />
      <animate attributeName="opacity" values="0.7;1;0.7" dur="6s" repeatCount="indefinite" />
    </circle>

    {/* Cloud Computing Elements */}
    <g transform="translate(250, 40)">
      <ellipse rx="35" ry="20" fill="white" opacity="0.95" stroke="url(#cloudGradient)" strokeWidth="1" />
      <ellipse cx="-15" cy="5" rx="20" ry="12" fill="white" opacity="0.9" />
      <ellipse cx="15" cy="5" rx="20" ry="12" fill="white" opacity="0.9" />
      <rect x="-10" y="-5" width="20" height="10" fill="url(#cloudDataGradient)" rx="2" />
    </g>

    {/* Analytics Icons */}
    <g transform="translate(400, 50)">
      <circle r="18" fill="url(#analyticsGradient)" />
      <rect x="-8" y="-8" width="16" height="16" fill="white" rx="2" />
      <rect x="-6" y="2" width="4" height="4" fill="url(#barGradient)" />
      <rect x="-1" y="-2" width="4" height="8" fill="url(#barGradient)" />
      <rect x="4" y="-6" width="4" height="12" fill="url(#barGradient)" />
    </g>

    {/* Notification Badges */}
    <circle cx="140" cy="90" r="8" fill="url(#notificationGradient)">
      <animate attributeName="r" values="8;10;8" dur="2s" repeatCount="indefinite" />
    </circle>
    <circle cx="370" cy="110" r="6" fill="url(#notification2Gradient)">
      <animate attributeName="r" values="6;8;6" dur="3s" repeatCount="indefinite" />
    </circle>

    {/* Academic Elements */}
    <g transform="translate(50, 320)">
      <rect width="40" height="30" fill="url(#bookGradient)" rx="4" />
      <rect x="5" y="5" width="30" height="3" fill="white" opacity="0.8" />
      <rect x="5" y="12" width="25" height="3" fill="white" opacity="0.8" />
      <rect x="5" y="19" width="30" height="3" fill="white" opacity="0.8" />
    </g>

    {/* Graduation Cap */}
    <g transform="translate(420, 320)">
      <rect x="-15" y="-5" width="30" height="10" fill="url(#capGradient)" rx="5" />
      <polygon points="0,-15 -20,-5 20,-5" fill="url(#capTopGradient)" />
      <circle cx="15" cy="-10" r="3" fill="url(#tasselGradient)" />
    </g>

    <defs>
      {/* Background Gradients */}
      <linearGradient id="bgGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FEFBFF" />
        <stop offset="50%" stopColor="#F8FAFC" />
        <stop offset="100%" stopColor="#F0FDFA" />
      </linearGradient>

      <linearGradient id="gridGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7C3AED" />
        <stop offset="100%" stopColor="#14B8A6" />
      </linearGradient>

      {/* Building Gradients */}
      <linearGradient id="buildingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7C3AED" />
        <stop offset="100%" stopColor="#14B8A6" />
      </linearGradient>

      <linearGradient id="headerGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#7C3AED" />
        <stop offset="100%" stopColor="#14B8A6" />
      </linearGradient>

      <linearGradient id="windowGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#EDE9FE" />
        <stop offset="100%" stopColor="#E6FFFA" />
      </linearGradient>

      <linearGradient id="doorGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7C3AED" />
        <stop offset="100%" stopColor="#14B8A6" />
      </linearGradient>

      {/* Screen and Device Gradients */}
      <linearGradient id="screenGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7C3AED" />
        <stop offset="100%" stopColor="#14B8A6" />
      </linearGradient>

      <linearGradient id="deviceGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7C3AED" />
        <stop offset="100%" stopColor="#14B8A6" />
      </linearGradient>

      {/* Chart Gradients */}
      <linearGradient id="chartGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7C3AED" opacity="0.8" />
        <stop offset="100%" stopColor="#A855F7" opacity="0.6" />
      </linearGradient>

      <linearGradient id="chart2Gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#14B8A6" opacity="0.8" />
        <stop offset="100%" stopColor="#0D9488" opacity="0.6" />
      </linearGradient>

      <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%" stopColor="#7C3AED" />
        <stop offset="100%" stopColor="#14B8A6" />
      </linearGradient>

      {/* App Gradients */}
      <linearGradient id="appGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7C3AED" />
        <stop offset="100%" stopColor="#A855F7" />
      </linearGradient>

      <linearGradient id="app2Gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#14B8A6" />
        <stop offset="100%" stopColor="#0D9488" />
      </linearGradient>

      <linearGradient id="buttonGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7C3AED" />
        <stop offset="100%" stopColor="#14B8A6" />
      </linearGradient>

      {/* Person Gradients */}
      <linearGradient id="personGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7C3AED" />
        <stop offset="100%" stopColor="#14B8A6" />
      </linearGradient>

      <linearGradient id="studentGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#14B8A6" />
        <stop offset="100%" stopColor="#0D9488" />
      </linearGradient>

      <linearGradient id="student2Gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7C3AED" />
        <stop offset="100%" stopColor="#A855F7" />
      </linearGradient>

      <linearGradient id="clothingGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#1F2937" />
        <stop offset="100%" stopColor="#374151" />
      </linearGradient>

      <linearGradient id="uniformGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#3B82F6" />
        <stop offset="100%" stopColor="#1D4ED8" />
      </linearGradient>

      <linearGradient id="uniform2Gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#EF4444" />
        <stop offset="100%" stopColor="#DC2626" />
      </linearGradient>

      <linearGradient id="faceGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#FED7AA" />
        <stop offset="100%" stopColor="#FDBA74" />
      </linearGradient>

      {/* Connection and Data Gradients */}
      <linearGradient id="connectionGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7C3AED" />
        <stop offset="100%" stopColor="#14B8A6" />
      </linearGradient>

      <linearGradient id="dataGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7C3AED" />
        <stop offset="100%" stopColor="#A855F7" />
      </linearGradient>

      <linearGradient id="data2Gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#14B8A6" />
        <stop offset="100%" stopColor="#0D9488" />
      </linearGradient>

      <linearGradient id="data3Gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F59E0B" />
        <stop offset="100%" stopColor="#D97706" />
      </linearGradient>

      {/* Cloud and Analytics Gradients */}
      <linearGradient id="cloudGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7C3AED" />
        <stop offset="100%" stopColor="#14B8A6" />
      </linearGradient>

      <linearGradient id="cloudDataGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7C3AED" />
        <stop offset="100%" stopColor="#14B8A6" />
      </linearGradient>

      <linearGradient id="analyticsGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7C3AED" />
        <stop offset="100%" stopColor="#14B8A6" />
      </linearGradient>

      <linearGradient id="barGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7C3AED" />
        <stop offset="100%" stopColor="#14B8A6" />
      </linearGradient>

      {/* Notification Gradients */}
      <linearGradient id="notificationGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#EF4444" />
        <stop offset="100%" stopColor="#DC2626" />
      </linearGradient>

      <linearGradient id="notification2Gradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#10B981" />
        <stop offset="100%" stopColor="#059669" />
      </linearGradient>

      {/* Academic Element Gradients */}
      <linearGradient id="bookGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7C3AED" />
        <stop offset="100%" stopColor="#14B8A6" />
      </linearGradient>

      <linearGradient id="capGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#1F2937" />
        <stop offset="100%" stopColor="#374151" />
      </linearGradient>

      <linearGradient id="capTopGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#7C3AED" />
        <stop offset="100%" stopColor="#14B8A6" />
      </linearGradient>

      <linearGradient id="tasselGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#F59E0B" />
        <stop offset="100%" stopColor="#D97706" />
      </linearGradient>
    </defs>
  </svg>
)
