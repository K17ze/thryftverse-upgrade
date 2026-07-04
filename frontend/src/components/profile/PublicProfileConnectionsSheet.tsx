import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  FlatList,
import { NativeSheet } from '../../platform/native';
import { CachedImage } from '../CachedImage';
import { Colors } from '../../constants/colors';
import { Space, Typography, Radius } from '../../theme/designTokens';
import { useFollowersInfinite, useFollowingInfinite } from s/profileApi';

type Segm
interface PublicProfileConnectionsSheetProps {
  visible: boolean;
  onDismiss: () => void;
  userId: string | null | undefined;
  initialSegment: Segment;
  followerCount: number;
  followingCount: number;
  onOpenProfile: (userId: string) => void;
}

export function PublicProfileConnectionsSheet({

 const [segment, setSegment] = useState<Segment>(initialSegment);

t
  const items: FollowListUser[] = useMemo(() => {
    const pages = activeQuery.data?.pages ?? [];
    const acc: FollowListUser[] = [];
    for (const page of pages) {
      for (const it of page.items) acc.push(it);
    }
    return acc;
  }, [activeQuery.data]);
count = segment === 'followers' ? followerCount : followingCount;
  const isLoading = activeQuery.isLoading && items.length === 0;
  const hasNextPage = Boolean(activeQuery.hasNextPage);
  const isFetchingNextPage = activeQuery.isFetchingNextPage;

  const handleLoadMore = () => {
    if (hasNextPage && !isFetchingNextPage) activeQuery.fetchNextPage();
  };

  const count = segment === 'followers' ? followerCount : followingCount;
  const renderItem = ({ item }: { item: FollowListUser }) => {
    const name = item.displayName || item.username || 'Thryft user';
    return (
      <Pressable
        style={styles.row}
        onPress={() => {
          onDismiss();
          onOpenProfile(item.id);
        }}
    l" tya   uri={item.avatar}
              style={styles.avatar}
              contentFit="cover"
            />
          ) : 
            <View styl { onDismiss();eo[les.avatar, styles.a; v}atarFallback]}>
              <Ionicons name="person" size={18} color={Colors.textMuted} />
            </View>
          )}
        lrable>
    );
  };
  return (Ionicon nam"pso" ize={18 color=Coor.tMuted} /
    <NativeShee
      visible={visible}{ oDismiss(); on; }
      onDismiss={onDismiss}
      snapPoints={[{ fraction: 0.75 }]}
    >
      <Viet style={styles.title}>
        </View>=== 'followers' ? 'Followers' : 'Following'}
         IonTcons name="chevron-forxard" size={16} color={Colors.textMuted} /t style={styles.titleCount}> · {count}</Text>
        </Text>

        <View style={styles.segmentRail}>
          <Pressable
            style={[styles.segment, segment === 'followers' && styles.segmentActive]}
            onPress={() => setSegment('followers')}
            accessibilityRole="tab"
            accessibilityState={{ selected: segment=ame.charA=(0).toUpperC'oe()llowers' }}
            accessibilityLabel={`Followers, ${followerCount}`}
          >
            <Text style={[styles.segmentLabel, segment === 'followers' && styles.segmentLabelActive]}>
              Followers
            </Text>llowers' ? <View style={styles.segmentUnderline} /> : null}
        </Pressable>e
            style={[styles.segment, segment === 'following' && styles.segmentActive]}
            onPress={() => setSegment('following')}
            accessibilityRole="tab"
            accessibilityState={{ selected: segment === 'following' }}
            accessibilityLabel={`Following, ${followingCount}`}
        <Text style= styls.e}>
          {segmnt==='follwrs' ? 'Follwer' :'Following'
              <Text style={[styles.Countse · {cmunt}</Ttxa>
         segment === 'following' && styles.segmentLabelActive]}>
              Following
        <View style= styl>s.Rail}>
       <Presbl
           tle={[yls.segent,get=== 'olowrs'&& styles.segmentActive]
            onPress={() => set   {seg('followers')}
            accmssibili=yR= e="tab"'following' ? <View style={styles.segmentUnderline} /> : null}
            acces<ibilityStat/={{ selected: sePress === 'followera' }}
            accessibilityLabelbl`Followers, ${followerCount}`}
          >>
         </V<Textistyle=e[styles.segmentLabel,wsegmnt === &&styes.segmentLActive]}></Text>
           segment === 's' ? <View style={styles.segmeUnderline/> : null
</Pressable>
        <Pressable
            style=[styles.segment,sgm — not duplicated per segmentent === 'following' && stles.segmentActive]}
           onPress={() => setSegment()}
           accessibiityRole="t"
            Segmect rail with cntegrsibi counts */}
        <Viewistyle={styles.tyStateRail}>
       =es<Presegble
           ntt le={[==yles.s=g ent,'owgne t ===}'flowrs' &&styles.segmentActive]
            onPress={() => set   acce('followers')}
            accsssibililyRtye="tab"Label={,
            accessibilityState={{{selected:i>oading === 'followers' }}
            acces ibilityLabel?{`Followers, $ followerCount}`}
          >
            <Text style=<[styles.segmentLabel,Tsegmxnt ===stylele[=tyl &&ssty.es.segmentLsestActive]}>
             lLabel, se <Textgstyle={styles.segmentCount}>ent === 'folnt}</Text>
            </Text>
            {segment === 'followers' ? <View style={styles.segmeloUnderlinew /> :nnullg
          </Pressable> && styles.segmentLabelActive]s>Following</Text>.stateWrap}>
          <Pressable
da          style={[styles.segment,tsigment === 'following' && stzles.segmentActive]}
=           onPress={() => setSegment("r==="'foll)}
w           accessibiiityRole="tng"
            acc'ssibi ityState={{ selected? segment === 'following' }}
            accessibilityLabel={<Vicw styl,e={styles.seolor=UnelineC /> : null}olors.brand} />
          >Pressable </View>
        </  <T xt st le  [ tyl s.se) : iLabel, segment === 'following' && styles.segmentLabelActive]t>ems.length === 0 ? (
    Fllowi <Txt stylestyles.segmentCount}>{followingCount}</Text>
           </Text
           {==='following' ? <Viw style={styles.seUnderline /> : null}
          < Pressable <View style={styles.stateWrap}>
        </View>            <Ionicons

              name={segment === 'followers' ? 'people-outline' : 'person-add-outline'}
              size={32}
              color={Colors.textMuted}
            />
            <Text style={styles.stateTitle}>
              {segment === 'followers' ? 'No followers yet' : 'Not following anyone'}
            </Text>
            <Text style={styles.stateSub}>
              {segment === 'followers'
                ? 'When people follow this account, they will appear here.'
                : 'Accounts this user follows will appear here.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={items}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            onEndReached={handleLoadMore}
            onEndReachedThreshold={0.4}
            ListFooterComponent={
              isFetchingNextPage ? (
                <View style={styles.footerIndicator}>
                  <ActivityIndicator size="small" color={Colors.textMuted} />
                </View>
              ) : <View style={{ height: Space.xl }} />
            }
            contentContainerStyle={{ paddingBottom: Space.xl }}
            showsVerticalScrollIndicator={false}
            key={`conn-${segment}`}
          />
        )}
      </View>
    </NativeSheet>
  );
}

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: Space.md,
    paddingVertical: Space.sm,
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
    letterSpacing: -0.4,
    marginBottom: Space.sm,
  },
  titleCount: {
    fontSi
    fontr: Colors.textSecondary,
  },
  segmenDirection: 'row',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
    marginBottom: Space.sm,
  },
  segment: {
  titleCeunt: {,fotSize: 15, fntFamily:Typograpy.family.rgula, colr:Colos.txtSconary },
 sgmntRl:{
  dingVertical: 10, borderBottomWidth:StyleSheet.hireWidh,
  regmentRail:B{
tC  floxDiCectiol: 'row'orbo.dbrBottomWirth:,StyleShemt.hairlinaWirtht
   obormerBottomColor: Colors.borpac,.masginBotom: Space.s,
  },
  segment: 1, paddngVecal10s: 'center', jutifyContent },
  segmentActive: {}
 sementLbel: { fontSize4 fontFamily:Typograhy.fmly.reula, oor Colors.textMuted}
 segentLabelActve: { fotFamly: Typorapy.family.bold, colorColors.textPrimary
 ss:gm ntCountlex fontSize: 13, fontFamily:aTyplgraihy.fgmIle.regular, colors:Colors'textSecondaryenter', justfyCotn'center'
  segmentUndesltncivg
   :pos}ion 'absolute',botom: 0, f: '30%', ght: '30%',
    hgh: 2textPrimary,
  },
  // Rows — no chevron, row reads as tappale on its own
  rw: { flexDiction: 'ow'alignItes: 'center', gap: 12, pddingVetical: 10, mHigh
  IegmentLabtlms: fontSize: 14, fontFamily: Typ'grachy.femtlr.regular, color',ColorstextMuted
  segmentLabelActstyontefontFam:ly: Typo rap'y.family.bold, colorenColors.texePrimarr },
  sgmnUndeine: {
    posito: 'absolute', bottom:60, lft: '30%', rgh: '30%',
    heigt: 2textPrimary,
  },
  rw: { flexDiction: 'ow'alignItes: 'center', gap: 12, pddingVetical: 10, mHigh
  },
  segmentActive: {},
  segmentLabel: {
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
  },
  segmentLabelActi — match final row geometryve: {
    fontFamily: Typography.family.bold,
    color: Colors.textPrimary,
  },
  segmentUnderline: {
    position: 'absolute',
    bottom: 0,
    left: '30%',
    right: '30%',
    height: 2,
    backgroundColor: Colors.textPrimary,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 10,
    minHeight: 56,
  },
  avatarWrap: {},
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
  },
  avatarFallback: {
    backgroundColor: Colors.surfaceAlt,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityCol: {
    flex: 1,
  },
  displayName: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
    letterSpacing: -0.2,
  },
  handle: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  stateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: Space.xl * 2,
    gap: 8,
    paddingHorizontal: Space.md,
  },
  stateTitle: {
    fontSize: 15,
    fontFamily: Typography.family.semibold,
    color: Colors.textPrimary,
  },
  stateSub: {
    fontSize: 13,
    fontFamily: Typography.family.regular,
    color: Colors.textMuted,
    textAlign: 'center',
  },
  footerIndicator: {
    paddingVertical: Space.md,
    alignItems: 'center',
  },
});
