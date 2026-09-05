const fs = require('fs');
const path = require('path');

const filePath = path.resolve('src/features/coach/components/CoachHome.tsx');
let content = fs.readFileSync(filePath, 'utf8');

// Replace the mobile CompetitionBanner
content = content.replace(
    /<CompetitionBanner\s*name=\{stats\.nextCompName\}\s*date=\{stats\.nextCompDate\}\s*location=\{stats\.nextCompLocation\}\s*level=\{stats\.nextCompLevel\}\s*mobile=\{true\}\s*\/>/,
    `<CompetitionBanner 
                            userId={user.id}
                            name={stats.nextCompName}
                            date={stats.nextCompDate}
                            location={stats.nextCompLocation}
                            level={stats.nextCompLevel}
                            mobile={true}
                            fullUserMetadata={user.user_metadata}
                        />`
);

fs.writeFileSync(filePath, content, 'utf8');
console.log("Replacement done");
