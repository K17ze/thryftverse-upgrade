import os
import re

screens_dir = 'C:/Users/ASUS/Desktop/thryftverse/frontend/src/screens'
os.chdir(screens_dir)

# Fix InboxScreen.tsx
with open('InboxScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

content = content.replace(
    "const seller = mockFind(MOCK_USERS, (user) => user.id === conversation.sellerId);",
    "const seller = null;"
)
content = content.replace(
    "const seller = mockFind(MOCK_USERS, (u) => u.id === item.sellerId);",
    "const seller = null;"
)
content = content.replace(
    "import { MOCK_USERS } from '../data/mockData';\n",
    ""
)
content = content.replace(
    "import { mockFind } from '../utils/mockGate';\n",
    ""
)
with open('InboxScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed InboxScreen.tsx')

# Fix ItemDetailScreen.tsx
with open('ItemDetailScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace(
    "const seller: User = mockFind(MOCK_USERS, u => u.id === item.sellerId) ?? MOCK_USERS[0];",
    "const seller = null;"
)
content = content.replace(
    "import { MOCK_LISTINGS, MOCK_USERS, Listing, User } from '../data/mockData';",
    "import { MOCK_LISTINGS, Listing, User } from '../data/mockData';"
)
content = content.replace(
    "import { mockFind, mockFallback } from '../utils/mockGate';\n",
    ""
)
with open('ItemDetailScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed ItemDetailScreen.tsx')

# Fix CheckoutScreen.tsx
with open('CheckoutScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace(
    "const seller = mockFind(MOCK_USERS, u => u.id === item.sellerId) || MOCK_USERS[0];",
    "const seller = null;"
)
content = content.replace(
    "import { MOCK_LISTINGS, MOCK_USERS } from '../data/mockData';",
    "import { MOCK_LISTINGS } from '../data/mockData';"
)
content = content.replace(
    "import { mockFind } from '../utils/mockGate';\n",
    ""
)
with open('CheckoutScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed CheckoutScreen.tsx')

# Fix OrderDetailScreen.tsx
with open('OrderDetailScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace(
    "mockFind(MOCK_USERS, (item) => item.id === (backendOrder?.sellerId ?? listing.sellerId)) ??",
    "null ??"
)
content = content.replace(
    "import { MOCK_LISTINGS, MOCK_USERS } from '../data/mockData';",
    "import { MOCK_LISTINGS } from '../data/mockData';"
)
content = content.replace(
    "import { mockFind, mockArrayOrEmpty } from '../utils/mockGate';\n",
    ""
)
with open('OrderDetailScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed OrderDetailScreen.tsx')

# Fix UserProfileScreen.tsx
with open('UserProfileScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace(
    ": mockFind(MOCK_USERS, (candidate) => candidate.id === route.params.userId) ?? MY_USER,",
    ": null,"
)
content = content.replace(
    "import { Listing, MOCK_USERS, MY_USER } from '../data/mockData';",
    "import { Listing, MY_USER } from '../data/mockData';"
)
with open('UserProfileScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed UserProfileScreen.tsx')

# Fix NotificationsScreen.tsx
with open('NotificationsScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace(
    "const actorUser = actorUserId ? mockFind(MOCK_USERS, (user) => user.id === actorUserId) : null;",
    "const actorUser = null;"
)
content = content.replace(
    "import { MOCK_USERS } from '../data/mockData';\n",
    ""
)
content = content.replace(
    "import { mockFind } from '../utils/mockGate';\n",
    ""
)
with open('NotificationsScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed NotificationsScreen.tsx')

# Fix MyOrdersScreen.tsx
with open('MyOrdersScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace(
    "buyer: mockFind(MOCK_USERS, (user) => user.id === order.buyerId),",
    "buyer: null,"
)
content = content.replace(
    ": mockFind(MOCK_USERS, (user) => user.id === order.item.sellerId);",
    ": null;"
)
content = content.replace(
    "import { MOCK_LISTINGS, MOCK_USERS, Listing, User } from '../data/mockData';",
    "import { MOCK_LISTINGS, Listing, User } from '../data/mockData';"
)
with open('MyOrdersScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed MyOrdersScreen.tsx')

# Fix MakeOfferScreen.tsx
with open('MakeOfferScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace(
    "const seller = mockFind(MOCK_USERS, (user) => user.id === listing.sellerId) || MOCK_USERS[0];",
    "const seller = null;"
)
content = content.replace(
    "import { MOCK_LISTINGS, MOCK_USERS } from '../data/mockData';",
    "import { MOCK_LISTINGS } from '../data/mockData';"
)
content = content.replace(
    "import { mockFind } from '../utils/mockGate';\n",
    ""
)
with open('MakeOfferScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed MakeOfferScreen.tsx')

# Fix CategoryDetailScreen.tsx
with open('CategoryDetailScreen.tsx', 'r', encoding='utf-8') as f:
    content = f.read()
content = content.replace(
    "const seller = mockFind(MOCK_USERS, (user) => user.id === item.sellerId);",
    "const seller = null;"
)
content = content.replace(
    "import { MOCK_CATEGORIES, MOCK_USERS } from '../data/mockData';",
    "import { MOCK_CATEGORIES } from '../data/mockData';"
)
content = content.replace(
    "import { mockFind } from '../utils/mockGate';\n",
    ""
)
with open('CategoryDetailScreen.tsx', 'w', encoding='utf-8') as f:
    f.write(content)
print('Fixed CategoryDetailScreen.tsx')

print('All critical files fixed!')
